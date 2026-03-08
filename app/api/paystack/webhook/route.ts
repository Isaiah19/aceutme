import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha512", paystackSecretKey)
    .update(rawBody)
    .digest("hex");

  return hash === signature;
}

function getEventKey(event: any) {
  const eventName = event?.event ?? "unknown";
  const dataId = event?.data?.id;
  const ref = event?.data?.reference;

  return `${eventName}:${dataId ?? ref ?? "no-id"}`;
}

async function markUserPremium(userId: string, email: string | null, plan: string) {
  const premiumSince = new Date();
  const premiumUntil = new Date();
  premiumUntil.setMonth(premiumUntil.getMonth() + 1);

  const normalizedPlan = plan === "pro" ? "pro" : "pro";

  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      user_id: userId,
      email,
      is_premium: true,
      plan: normalizedPlan,
      premium_since: premiumSince.toISOString(),
      premium_until: premiumUntil.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return error;
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    const verified = verifyPaystackSignature(rawBody, signature);

    if (!verified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventName = event?.event ?? "unknown";
    const data = event?.data ?? {};
    const eventKey = getEventKey(event);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("paystack_events")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Failed to check existing event", details: existingError.message },
        { status: 500 }
      );
    }

    if (existing?.event_key) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const { error: eventInsertError } = await supabaseAdmin.from("paystack_events").insert({
      event_key: eventKey,
      event_name: eventName,
      reference: data?.reference ?? null,
      payload: event,
    });

    if (eventInsertError && (eventInsertError as any)?.code !== "23505") {
      return NextResponse.json(
        { error: "Failed to log event", details: eventInsertError.message },
        { status: 500 }
      );
    }

    if (eventName === "charge.success") {
      const reference = String(data?.reference || "").trim();
      const amount_kobo = Number(data?.amount ?? 0);
      const paidAt = data?.paid_at ?? new Date().toISOString();
      const email = data?.customer?.email ?? null;
      const userId = data?.metadata?.user_id ?? null;
      const plan = "pro";
      const paystackTransactionId = data?.id ?? null;
      const paystackCustomerCode = data?.customer?.customer_code ?? null;
      const paystackAuthorizationCode = data?.authorization?.authorization_code ?? null;

      if (!reference) {
        return NextResponse.json(
          { error: "Missing payment reference in webhook payload" },
          { status: 400 }
        );
      }

      const paymentUpdatePayload = {
        status: "success",
        amount_kobo,
        amount: amount_kobo,
        currency: data?.currency ?? "NGN",
        customer_email: email,
        paid_at: paidAt,
        plan,
        paystack_transaction_id: paystackTransactionId,
        paystack_customer_code: paystackCustomerCode,
        paystack_authorization_code: paystackAuthorizationCode,
        raw: data,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRows, error: paymentError } = await supabaseAdmin
        .from("payments")
        .update(paymentUpdatePayload)
        .eq("reference", reference)
        .select("id, reference");

      if (paymentError) {
        return NextResponse.json(
          { error: "Payment update failed", details: paymentError.message },
          { status: 500 }
        );
      }

      if (!updatedRows || updatedRows.length === 0) {
        const { error: fallbackInsertError } = await supabaseAdmin.from("payments").insert({
          user_id: userId,
          provider: "paystack",
          reference,
          ...paymentUpdatePayload,
        });

        if (fallbackInsertError) {
          return NextResponse.json(
            {
              error: "Payment row not found and fallback insert failed",
              details: fallbackInsertError.message,
            },
            { status: 500 }
          );
        }
      }

      if (userId) {
        const profileErr = await markUserPremium(userId, email, plan);

        if (profileErr) {
          return NextResponse.json(
            { error: "Profile upgrade failed", details: profileErr.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Webhook error" },
      { status: 500 }
    );
  }
}
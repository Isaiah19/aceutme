import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  if (!paystackSecretKey || !signature) return false;
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

  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      user_id: userId,
      email,
      is_premium: true,
      plan,
      premium_since: premiumSince.toISOString(),
      premium_until: premiumUntil.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return error;
}

export async function GET() {
  return NextResponse.json({ message: "Paystack webhook endpoint ✅" });
}

export async function POST(req: Request) {
  try {
    if (!paystackSecretKey) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY" },
        { status: 500 }
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    const ok = verifyPaystackSignature(rawBody, signature);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventName = event?.event ?? "unknown";
    const data = event?.data ?? {};
    const eventKey = getEventKey(event);

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("paystack_events")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        { error: "Failed to check existing event", details: existingErr.message },
        { status: 500 }
      );
    }

    if (existing?.event_key) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const { error: evtErr } = await supabaseAdmin.from("paystack_events").insert({
      event_key: eventKey,
      event_name: eventName,
      reference: data?.reference ?? null,
      payload: event,
    });

    if (evtErr && (evtErr as any)?.code !== "23505") {
      return NextResponse.json(
        { error: "Failed to log event", details: evtErr.message },
        { status: 500 }
      );
    }

    if (eventName === "charge.success") {
      const reference = String(data?.reference || "").trim();
      const amount_kobo = Number(data?.amount ?? 0);
      const paidAt = data?.paid_at ?? new Date().toISOString();
      const email = data?.customer?.email ?? null;
      const userId = data?.metadata?.user_id ?? null;
      const plan = data?.metadata?.plan ?? "pro";
      const paystackTransactionId = data?.id ?? null;
      const paystackCustomerCode = data?.customer?.customer_code ?? null;
      const paystackAuthorizationCode = data?.authorization?.authorization_code ?? null;

      if (!reference) {
        return NextResponse.json(
          { error: "Missing payment reference in webhook payload" },
          { status: 400 }
        );
      }

      const { data: updatedRows, error: paymentErr } = await supabaseAdmin
        .from("payments")
        .update({
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
        })
        .eq("reference", reference)
        .select("reference");

      if (paymentErr) {
        return NextResponse.json(
          { error: "Failed to update payment", details: paymentErr.message },
          { status: 500 }
        );
      }

      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json(
          { error: "Payment row not found for reference", details: reference },
          { status: 404 }
        );
      }

      if (userId) {
        const profileErr = await markUserPremium(userId, email, plan);

        if (profileErr) {
          return NextResponse.json(
            { error: "Failed to upgrade profile", details: profileErr.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Webhook error" },
      { status: 500 }
    );
  }
}
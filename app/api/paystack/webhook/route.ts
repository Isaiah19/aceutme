import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY!;

type PaymentRow = {
  id: number;
  user_id: string | null;
  reference: string;
  provider: string | null;
  amount_kobo: number | null;
  currency: string | null;
  status: string | null;
  customer_email: string | null;
  plan: string | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  is_premium: boolean | null;
  plan: string | null;
  premium_since: string | null;
  premium_until: string | null;
};

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

function addOneMonthFrom(baseDate: Date) {
  const d = new Date(baseDate);
  d.setMonth(d.getMonth() + 1);
  return d;
}

async function grantPremiumSafely(input: {
  userId: string;
  email: string | null;
  plan: string;
}) {
  const { data: existingProfile, error: profileReadError } = await supabaseAdmin
    .from("profiles")
    .select("user_id,email,is_premium,plan,premium_since,premium_until")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (profileReadError) {
    throw new Error(`Failed to load profile: ${profileReadError.message}`);
  }

  const profile = (existingProfile ?? null) as ProfileRow | null;
  const now = new Date();

  const currentPremiumUntil =
    profile?.premium_until ? new Date(profile.premium_until) : null;

  const baseDate =
    currentPremiumUntil && currentPremiumUntil.getTime() > now.getTime()
      ? currentPremiumUntil
      : now;

  const premiumSince =
    profile?.premium_since && profile.premium_until && currentPremiumUntil && currentPremiumUntil.getTime() > now.getTime()
      ? profile.premium_since
      : now.toISOString();

  const premiumUntil = addOneMonthFrom(baseDate).toISOString();

  const { error: upsertError } = await supabaseAdmin.from("profiles").upsert(
    {
      user_id: input.userId,
      email: input.email ?? profile?.email ?? null,
      is_premium: true,
      plan: input.plan || profile?.plan || "pro",
      premium_since: premiumSince,
      premium_until: premiumUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    throw new Error(`Failed to upgrade profile: ${upsertError.message}`);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!verifyPaystackSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventName = event?.event ?? "unknown";
    const data = event?.data ?? {};
    const eventKey = getEventKey(event);

    const { data: existingEvent, error: existingEventError } = await supabaseAdmin
      .from("paystack_events")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (existingEventError) {
      return NextResponse.json(
        { error: "Failed to check existing event", details: existingEventError.message },
        { status: 500 }
      );
    }

    if (existingEvent?.event_key) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const { error: insertEventError } = await supabaseAdmin.from("paystack_events").insert({
      event_key: eventKey,
      event_name: eventName,
      reference: data?.reference ?? null,
      payload: event,
    });

    if (insertEventError && (insertEventError as any)?.code !== "23505") {
      return NextResponse.json(
        { error: "Failed to log event", details: insertEventError.message },
        { status: 500 }
      );
    }

    if (eventName !== "charge.success") {
      return NextResponse.json({ received: true, ignored: true });
    }

    const reference = String(data?.reference ?? "").trim();
    const webhookAmount = Number(data?.amount ?? 0);
    const webhookCurrency = String(data?.currency ?? "").toUpperCase();
    const webhookEmail = data?.customer?.email ? String(data.customer.email).trim().toLowerCase() : null;
    const webhookUserId = data?.metadata?.user_id ? String(data.metadata.user_id).trim() : null;

    if (!reference) {
      return NextResponse.json(
        { error: "Missing payment reference in webhook payload" },
        { status: 400 }
      );
    }

    const { data: paymentRow, error: paymentReadError } = await supabaseAdmin
      .from("payments")
      .select("id,user_id,reference,provider,amount_kobo,currency,status,customer_email,plan")
      .eq("reference", reference)
      .maybeSingle();

    if (paymentReadError) {
      return NextResponse.json(
        { error: "Failed to load local payment", details: paymentReadError.message },
        { status: 500 }
      );
    }

    if (!paymentRow) {
      return NextResponse.json({
        received: true,
        ignored: true,
        reason: "No local payment row found for reference",
      });
    }

    const localPayment = paymentRow as PaymentRow;

    if (localPayment.status === "success") {
      return NextResponse.json({
        received: true,
        duplicate_fulfillment: true,
      });
    }

    if (!localPayment.amount_kobo || webhookAmount !== Number(localPayment.amount_kobo)) {
      return NextResponse.json(
        {
          error: "Amount mismatch",
          details: `Expected ${localPayment.amount_kobo}, got ${webhookAmount}`,
        },
        { status: 400 }
      );
    }

    const expectedCurrency = String(localPayment.currency ?? "NGN").toUpperCase();
    if (webhookCurrency !== expectedCurrency) {
      return NextResponse.json(
        {
          error: "Currency mismatch",
          details: `Expected ${expectedCurrency}, got ${webhookCurrency}`,
        },
        { status: 400 }
      );
    }

    if (localPayment.customer_email && webhookEmail) {
      const expectedEmail = String(localPayment.customer_email).trim().toLowerCase();
      if (expectedEmail !== webhookEmail) {
        return NextResponse.json(
          {
            error: "Customer email mismatch",
            details: `Expected ${expectedEmail}, got ${webhookEmail}`,
          },
          { status: 400 }
        );
      }
    }

    if (localPayment.user_id && webhookUserId && localPayment.user_id !== webhookUserId) {
      return NextResponse.json(
        {
          error: "User mismatch",
          details: "Webhook user does not match local payment user",
        },
        { status: 400 }
      );
    }

    const finalUserId = localPayment.user_id || webhookUserId;
    const finalPlan = localPayment.plan || "pro";

    if (!finalUserId) {
      return NextResponse.json(
        { error: "Could not determine payment owner" },
        { status: 400 }
      );
    }

    const paymentUpdatePayload = {
      status: "success",
      amount_kobo: webhookAmount,
      amount: webhookAmount,
      currency: webhookCurrency,
      customer_email: webhookEmail || localPayment.customer_email || null,
      paid_at: data?.paid_at ?? new Date().toISOString(),
      plan: finalPlan,
      paystack_transaction_id: data?.id ?? null,
      paystack_customer_code: data?.customer?.customer_code ?? null,
      paystack_authorization_code: data?.authorization?.authorization_code ?? null,
      raw: data,
      updated_at: new Date().toISOString(),
    };

    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update(paymentUpdatePayload)
      .eq("id", localPayment.id);

    if (paymentUpdateError) {
      return NextResponse.json(
        { error: "Payment update failed", details: paymentUpdateError.message },
        { status: 500 }
      );
    }

    await grantPremiumSafely({
      userId: finalUserId,
      email: webhookEmail || localPayment.customer_email || null,
      plan: finalPlan,
    });

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Webhook error" },
      { status: 500 }
    );
  }
}
// app/api/paystack/webhook/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side Supabase client (SERVICE ROLE)
 * Make sure SUPABASE_SERVICE_ROLE_KEY is set in Vercel env vars
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

/**
 * Idempotency key:
 * Paystack event payload usually has:
 * - event.event (string)
 * - event.data.id (number)  OR event.data.reference (string)
 */
function getEventKey(event: any) {
  const eventName = event?.event ?? "unknown";
  const dataId = event?.data?.id;
  const ref = event?.data?.reference;
  return `${eventName}:${dataId ?? ref ?? "no-id"}`;
}

export async function POST(req: Request) {
  try {
    // Must be raw text for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    const ok = verifyPaystackSignature(rawBody, signature);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventName: string = event?.event ?? "unknown";
    const data = event?.data ?? {};
    const eventKey = getEventKey(event);

    // ✅ Idempotency: store eventKey so we never process twice
    // You need a table `paystack_events` with unique `event_key` (see SQL below)
    const { data: existing } = await supabaseAdmin
      .from("paystack_events")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (existing?.event_key) {
      // Already processed
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Insert event record first (so retries won’t double-run)
    const { error: evtErr } = await supabaseAdmin.from("paystack_events").insert({
      event_key: eventKey,
      event_name: eventName,
      reference: data?.reference ?? null,
      payload: event,
    });

    if (evtErr) {
      // If unique constraint hits because two webhooks race, treat as ok
      if ((evtErr as any)?.code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      return NextResponse.json({ error: "Failed to log event", details: evtErr.message }, { status: 500 });
    }

    // ✅ Handle important events
    if (eventName === "charge.success") {
      // charge.success: save payment + mark user premium (if applicable)
      // data.reference, data.amount (kobo), data.customer.email, data.metadata, etc.
      const reference = data?.reference;
      const amount = data?.amount; // usually in kobo
      const status = data?.status; // "success"
      const paidAt = data?.paid_at ?? null;
      const email = data?.customer?.email ?? null;

      // Save/Upsert payment record (you need a `payments` table; see SQL below)
      const { error: payErr } = await supabaseAdmin.from("payments").upsert(
        {
          reference,
          amount,
          currency: data?.currency ?? "NGN",
          status,
          paid_at: paidAt,
          customer_email: email,
          raw: data,
        },
        { onConflict: "reference" }
      );

      if (payErr) {
        return NextResponse.json({ error: "Failed to save payment", details: payErr.message }, { status: 500 });
      }

      /**
       * OPTIONAL: If you attach user_id in Paystack metadata when creating payment:
       * data.metadata.user_id
       *
       * Then you can upgrade the user in your `profiles` or `subscriptions` table.
       */
      const userId = data?.metadata?.user_id ?? null;
      if (userId) {
        await supabaseAdmin
          .from("profiles")
          .update({ is_premium: true })
          .eq("user_id", userId);
      }
    }

    // Add more handlers later:
    // - "subscription.create"
    // - "subscription.disable"
    // - "invoice.payment_failed"
    // etc.

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Webhook error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Paystack webhook endpoint ✅" });
}
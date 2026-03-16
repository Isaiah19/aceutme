import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getSiteUrl() {
  return (
    process.env.PAYSTACK_CALLBACK_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://aceutme.com"
  ).replace(/\/+$/, "");
}

export async function GET() {
  return NextResponse.json({
    message: "Paystack initialize endpoint. Use POST with auth token.",
  });
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: missing token" },
        { status: 401 }
      );
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !authData?.user) {
      return NextResponse.json(
        {
          error: "Unauthorized: invalid token",
          details: authErr?.message,
        },
        { status: 401 }
      );
    }

    const user = authData.user;
    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "pro").trim().toLowerCase();

    const amount_kobo = 500000;
    const callback_url =
      process.env.PAYSTACK_CALLBACK_URL ||
      `${getSiteUrl()}/checkout/success`;

    const reference = `ACEUTME-${user.id}-${Date.now()}`;

    const { error: payInsertErr } = await supabaseAdmin.from("payments").insert({
      user_id: user.id,
      reference,
      provider: "paystack",
      amount_kobo,
      currency: "NGN",
      status: "pending",
      customer_email: user.email ?? null,
      plan,
    });

    if (payInsertErr) {
      return NextResponse.json(
        {
          error: "Failed to create payment record",
          details: payInsertErr.message,
        },
        { status: 500 }
      );
    }

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amount_kobo,
        currency: "NGN",
        reference,
        callback_url,
        metadata: {
          user_id: user.id,
          plan,
          platform: "AceUTME",
        },
      }),
    });

    const paystackData = await paystackRes.json().catch(() => ({}));

    if (!paystackRes.ok || !paystackData?.status) {
      return NextResponse.json(
        {
          error: "Paystack initialize failed",
          details: paystackData?.message || "Unknown error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference,
      callback_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
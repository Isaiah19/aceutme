import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/src/lib/mailer";
import { paymentSuccessTemplate } from "@/src/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

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
  const { data: existingProfile, error: profileReadError } = await supabase
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
    profile?.premium_since &&
    profile.premium_until &&
    currentPremiumUntil &&
    currentPremiumUntil.getTime() > now.getTime()
      ? profile.premium_since
      : now.toISOString();

  const premiumUntil = addOneMonthFrom(baseDate).toISOString();

  const { error: upsertError } = await supabase.from("profiles").upsert(
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

  return {
    premiumSince,
    premiumUntil,
    email: input.email ?? profile?.email ?? null,
  };
}

async function sendPaymentSuccessEmail(input: {
  to: string;
  reference: string;
  amountKobo: number;
  currency: string;
  plan: string;
  premiumUntil: string;
}) {
  const template = paymentSuccessTemplate({
    plan: input.plan,
    amountKobo: input.amountKobo,
    currency: input.currency,
    reference: input.reference,
    premiumUntil: input.premiumUntil,
  });

  await sendEmail({
    to: input.to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

export async function POST(req: Request) {
  try {
    const { reference } = await req.json().catch(() => ({}));

    const cleanReference = String(reference ?? "").trim();

    if (!cleanReference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const { data: paymentRow, error: paymentReadError } = await supabase
      .from("payments")
      .select(
        "id,user_id,reference,provider,amount_kobo,currency,status,customer_email,plan"
      )
      .eq("reference", cleanReference)
      .maybeSingle();

    if (paymentReadError) {
      return NextResponse.json(
        {
          error: "Failed to load local payment",
          details: paymentReadError.message,
        },
        { status: 500 }
      );
    }

    if (!paymentRow) {
      return NextResponse.json(
        { error: "Payment reference not found locally" },
        { status: 404 }
      );
    }

    const localPayment = paymentRow as PaymentRow;

    if (localPayment.status === "success") {
      return NextResponse.json({
        success: true,
        already_verified: true,
      });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        cleanReference
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyRes.json().catch(() => ({}));

    if (
      !verifyRes.ok ||
      !verifyData?.status ||
      verifyData?.data?.status !== "success"
    ) {
      return NextResponse.json(
        {
          error: "Payment not successful",
          details: verifyData?.message || "Verification failed",
        },
        { status: 400 }
      );
    }

    const data = verifyData.data;
    const verifiedAmount = Number(data?.amount ?? 0);
    const verifiedCurrency = String(data?.currency ?? "").toUpperCase();
    const verifiedEmail = data?.customer?.email
      ? String(data.customer.email).trim().toLowerCase()
      : null;
    const verifiedUserId = data?.metadata?.user_id
      ? String(data.metadata.user_id).trim()
      : null;
    const verifiedPlan = data?.metadata?.plan
      ? String(data.metadata.plan).trim()
      : null;

    if (
      !localPayment.amount_kobo ||
      verifiedAmount !== Number(localPayment.amount_kobo)
    ) {
      return NextResponse.json(
        {
          error: "Amount mismatch",
          details: `Expected ${localPayment.amount_kobo}, got ${verifiedAmount}`,
        },
        { status: 400 }
      );
    }

    const expectedCurrency = String(
      localPayment.currency ?? "NGN"
    ).toUpperCase();

    if (verifiedCurrency !== expectedCurrency) {
      return NextResponse.json(
        {
          error: "Currency mismatch",
          details: `Expected ${expectedCurrency}, got ${verifiedCurrency}`,
        },
        { status: 400 }
      );
    }

    if (localPayment.customer_email && verifiedEmail) {
      const expectedEmail = String(localPayment.customer_email)
        .trim()
        .toLowerCase();

      if (expectedEmail !== verifiedEmail) {
        return NextResponse.json(
          {
            error: "Customer email mismatch",
            details: `Expected ${expectedEmail}, got ${verifiedEmail}`,
          },
          { status: 400 }
        );
      }
    }

    if (
      localPayment.user_id &&
      verifiedUserId &&
      localPayment.user_id !== verifiedUserId
    ) {
      return NextResponse.json(
        {
          error: "User mismatch",
          details: "Verified payment user does not match local payment user",
        },
        { status: 400 }
      );
    }

    const finalUserId = localPayment.user_id || verifiedUserId;
    const finalPlan = localPayment.plan || verifiedPlan || "pro";

    if (!finalUserId) {
      return NextResponse.json(
        { error: "Could not determine payment owner" },
        { status: 400 }
      );
    }

    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({
        status: "success",
        paid_at: data?.paid_at ?? new Date().toISOString(),
        amount_kobo: verifiedAmount,
        currency: verifiedCurrency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", localPayment.id);

    if (paymentUpdateError) {
      return NextResponse.json(
        {
          error: "Failed to update payment",
          details: paymentUpdateError.message,
        },
        { status: 500 }
      );
    }

    const premiumResult = await grantPremiumSafely({
      userId: finalUserId,
      email: verifiedEmail || localPayment.customer_email || null,
      plan: finalPlan,
    });

    const emailToUse =
      premiumResult.email || verifiedEmail || localPayment.customer_email || null;

    if (emailToUse) {
      try {
        await sendPaymentSuccessEmail({
          to: emailToUse,
          reference: cleanReference,
          amountKobo: verifiedAmount,
          currency: verifiedCurrency,
          plan: finalPlan,
          premiumUntil: premiumResult.premiumUntil,
        });
      } catch (mailError: any) {
        console.error("Payment confirmation email failed:", mailError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Verify failed" },
      { status: 500 }
    );
  }
}
cd ../..
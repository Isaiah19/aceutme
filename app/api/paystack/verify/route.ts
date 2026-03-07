import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== "success") {
      return NextResponse.json({ error: "Payment not successful" }, { status: 400 });
    }

    const data = verifyData.data;

    const userId = data.metadata?.user_id ?? null;
    const email = data.customer?.email ?? null;
    const plan = data.metadata?.plan ?? "pro";

    await supabase
      .from("payments")
      .update({
        status: "success",
        paid_at: data.paid_at,
        amount_kobo: data.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);

    if (userId) {
      const premiumSince = new Date();
      const premiumUntil = new Date();
      premiumUntil.setMonth(premiumUntil.getMonth() + 1);

      await supabase.from("profiles").upsert(
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
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Verify failed" },
      { status: 500 }
    );
  }
}

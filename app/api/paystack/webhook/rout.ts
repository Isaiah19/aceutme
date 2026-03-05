// app/api/paystack/webhook/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs"; // required for crypto in some setups

function verifyPaystackSignature(body: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY; // set this in Vercel env vars
  if (!secret || !signature) return false;

  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
  return hash === signature;
}

export async function POST(req: Request) {
  // Paystack sends raw JSON body. We MUST read it as text first for signature verification.
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const ok = verifyPaystackSignature(rawBody, signature);
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Now safe to parse
  const event = JSON.parse(rawBody);

  // ✅ You can inspect event.event and event.data here
  // Example: charge.success
  // console.log("Paystack webhook:", event.event, event.data?.reference);

  // IMPORTANT: return 200 fast
  return NextResponse.json({ received: true });
}

// Optional: block other methods
export async function GET() {
  return NextResponse.json({ message: "Paystack webhook endpoint" });
}

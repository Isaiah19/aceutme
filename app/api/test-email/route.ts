import { NextResponse } from "next/server";
import { sendEmail } from "@/src/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const to = String(body?.to || process.env.SMTP_USER || "").trim();

    if (!to) {
      return NextResponse.json(
        { error: "Missing recipient email" },
        { status: 400 }
      );
    }

    const info = await sendEmail({
      to,
      subject: "AceUTME test email",
      text: "Your Zoho SMTP setup is working.",
      html: "<p>Your Zoho SMTP setup is working.</p>",
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "Failed to send email",
      },
      { status: 500 }
    );
  }
}

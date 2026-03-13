import { NextResponse } from "next/server";
import { sendEmail } from "@/src/lib/mailer";
import { welcomeTemplate } from "@/src/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = String(body?.email || "").trim().toLowerCase();
    const firstName = String(body?.firstName || "").trim();

    if (!email) {
      return NextResponse.json(
        { error: "Missing email address" },
        { status: 400 }
      );
    }

    const template = welcomeTemplate({
      name: firstName || null,
    });

    const info = await sendEmail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "Failed to send welcome email",
      },
      { status: 500 }
    );
  }
}

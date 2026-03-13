import { NextResponse } from "next/server";
import { sendEmail } from "@/src/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message || "").trim();
    const userEmail = String(body?.email || "").trim().toLowerCase();
    const userName = String(body?.name || "").trim();
    const page = String(body?.page || "").trim();
    const category = String(body?.category || "").trim();
    const userId = String(body?.userId || "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Feedback message is required" },
        { status: 400 }
      );
    }

    if (message.length < 3) {
      return NextResponse.json(
        { error: "Feedback message is too short" },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { error: "Feedback message is too long" },
        { status: 400 }
      );
    }

    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
    const safeUserEmail = escapeHtml(userEmail || "Not provided");
    const safeUserName = escapeHtml(userName || "Not provided");
    const safePage = escapeHtml(page || "Not provided");
    const safeCategory = escapeHtml(category || "General");
    const safeUserId = escapeHtml(userId || "Not provided");

    const textLines = [
      "New AceUTME feedback received.",
      "",
      `Category: ${category || "General"}`,
      `User Name: ${userName || "Not provided"}`,
      `User Email: ${userEmail || "Not provided"}`,
      `User ID: ${userId || "Not provided"}`,
      `Page: ${page || "Not provided"}`,
      `Submitted At: ${new Date().toISOString()}`,
      "",
      "Message:",
      message,
    ];

    const info = await sendEmail({
      to: process.env.FEEDBACK_TO_EMAIL || process.env.SMTP_USER || "admin@aceutme.com",
      subject: `AceUTME Feedback${category ? ` - ${category}` : ""}`,
      text: textLines.join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b;">
          <h2 style="margin-bottom: 12px;">New AceUTME Feedback</h2>
          <p><strong>Category:</strong> ${safeCategory}</p>
          <p><strong>User Name:</strong> ${safeUserName}</p>
          <p><strong>User Email:</strong> ${safeUserEmail}</p>
          <p><strong>User ID:</strong> ${safeUserId}</p>
          <p><strong>Page:</strong> ${safePage}</p>
          <p><strong>Submitted At:</strong> ${escapeHtml(
            new Date().toISOString()
          )}</p>
          <hr style="margin: 16px 0;" />
          <p><strong>Message:</strong></p>
          <p>${safeMessage}</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "Feedback sent successfully",
      messageId: info.messageId,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "Failed to send feedback",
      },
      { status: 500 }
    );
  }
}

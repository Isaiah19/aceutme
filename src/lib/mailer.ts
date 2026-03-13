import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || "false") === "true";
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFromAddress = process.env.MAIL_FROM_ADDRESS;
const mailFromName = process.env.MAIL_FROM_NAME || "AceUTME";

if (!smtpHost || !smtpUser || !smtpPass || !mailFromAddress) {
  console.warn(
    "Mailer env vars are missing. Email sending will fail until configured."
  );
}

export const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

export async function sendEmail(input: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  return transporter.sendMail({
    from: `"${mailFromName}" <${mailFromAddress}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

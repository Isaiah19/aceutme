export function paymentSuccessTemplate(input?: {
  name?: string | null;
  plan?: string | null;
  amountKobo?: number | null;
  currency?: string | null;
  reference?: string | null;
  premiumUntil?: string | null;
}) {
  const greeting = input?.name ? `Hello ${input.name},` : "Hello,";
  const plan = (input?.plan || "pro").toUpperCase();
  const currency = (input?.currency || "NGN").toUpperCase();

  const amount =
    typeof input?.amountKobo === "number"
      ? (input.amountKobo / 100).toLocaleString("en-NG", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : null;

  const premiumUntilText = input?.premiumUntil
    ? new Date(input.premiumUntil).toLocaleString()
    : null;

  return {
    subject: "AceUTME payment confirmed",
    text: [
      greeting,
      "",
      `Your payment for AceUTME ${plan} has been confirmed.`,
      amount ? `Amount: ${currency} ${amount}` : null,
      input?.reference ? `Reference: ${input.reference}` : null,
      premiumUntilText
        ? `Premium access active until: ${premiumUntilText}`
        : null,
      "",
      "You can now access AceUTME premium features.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b;">
        <h2 style="margin-bottom: 12px;">Payment confirmed</h2>
        <p>${greeting}</p>
        <p>Your payment for <strong>AceUTME ${plan}</strong> has been confirmed.</p>
        <p>
          ${
            amount
              ? `<strong>Amount:</strong> ${currency} ${amount}<br />`
              : ""
          }
          ${
            input?.reference
              ? `<strong>Reference:</strong> ${input.reference}<br />`
              : ""
          }
          ${
            premiumUntilText
              ? `<strong>Premium access active until:</strong> ${premiumUntilText}`
              : ""
          }
        </p>
        <p>You can now access AceUTME premium features.</p>
      </div>
    `,
  };
}

export function welcomeTemplate(input?: { name?: string | null }) {
  const greeting = input?.name ? `Hello ${input.name},` : "Hello,";

  return {
    subject: "Welcome to AceUTME",
    text: [
      greeting,
      "",
      "Your AceUTME account has been created successfully.",
      "Your account starts on the Free plan and you can now log in and begin using the platform.",
      "",
      "Welcome to AceUTME.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b;">
        <h2 style="margin-bottom: 12px;">Welcome to AceUTME</h2>
        <p>${greeting}</p>
        <p>Your AceUTME account has been created successfully.</p>
        <p>Your account starts on the <strong>Free plan</strong> and you can now log in and begin using the platform.</p>
        <p>Welcome to <strong>AceUTME</strong>.</p>
      </div>
    `,
  };
}


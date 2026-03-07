"use client";

import { useEffect, useMemo, useState } from "react";

type VerifyState = "idle" | "verifying" | "success" | "error";

export default function CheckoutSuccessPage() {
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [message, setMessage] = useState(
    "Your payment is being confirmed. If your premium access does not show immediately, refresh your dashboard in a few seconds."
  );

  const reference = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("reference") || params.get("trxref") || "";
  }, []);

  useEffect(() => {
    async function verifyPayment() {
      if (!reference) {
        setVerifyState("error");
        setMessage("Payment reference was not found in the URL.");
        return;
      }

      setVerifyState("verifying");

      try {
        const res = await fetch("/api/paystack/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reference }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setVerifyState("error");
          setMessage(data?.error ?? "We could not verify your payment yet.");
          return;
        }

        setVerifyState("success");
        setMessage("Payment verified successfully. Your premium access is now active.");
      } catch (e: any) {
        setVerifyState("error");
        setMessage(e?.message ?? "We could not verify your payment yet.");
      }
    }

    verifyPayment();
  }, [reference]);

  const statusClass =
    verifyState === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : verifyState === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-zinc-200 bg-zinc-50 text-zinc-900";

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-zinc-900">Payment received</h1>

          <p className="mt-3 text-sm text-zinc-600">
            We are confirming your Paystack payment and unlocking your AceUTME Pro access.
          </p>

          <div className={`mt-6 rounded-xl border p-4 ${statusClass}`}>
            <div className="text-sm font-semibold">
              {verifyState === "success"
                ? "Verification successful"
                : verifyState === "error"
                ? "Verification pending"
                : "Verifying payment"}
            </div>
            <div className="mt-1 text-sm">{message}</div>

            {reference && (
              <div className="mt-3 text-xs break-all opacity-80">
                Reference: {reference}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/dashboard"
              className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
            >
              Go to Dashboard
            </a>

            <a
              href="/cbt/full"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
            >
              Open Full Mock
            </a>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            {verifyState === "success"
              ? "You can now continue with premium features."
              : "If verification takes longer than expected, refresh your dashboard in a few seconds."}
          </p>
        </div>
      </div>
    </main>
  );
}
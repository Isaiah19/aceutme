"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";

const PRICE_NGN = 5000;

function fmtNaira(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type Notice = { type: "info" | "success" | "error"; text: string };

export default function CheckoutPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  const [agreed, setAgreed] = useState(false);
  const [method, setMethod] = useState<"paystack" | "flutterwave">("paystack");
  const [paying, setPaying] = useState(false);

  // Inline message instead of alert()
  const [notice, setNotice] = useState<Notice | null>(null);

  // Optional stub
  const [alreadyPro] = useState(false);

  const today = useMemo(() => new Date(), []);
  const nextCharge = useMemo(() => addMonths(today, 1), [today]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.push("/login?next=/checkout");
        return;
      }

      setEmail(user.email ?? null);
      setCheckingAuth(false);
    })();
  }, [router]);

  function pushNotice(n: Notice) {
    setNotice(n);
    // auto-dismiss after 5s
    window.setTimeout(() => {
      setNotice((cur) => (cur?.text === n.text ? null : cur));
    }, 5000);
  }

  async function handlePay(selected: "paystack" | "flutterwave") {
    if (alreadyPro) {
      pushNotice({ type: "info", text: "You are already subscribed to Pro." });
      return;
    }

    if (!agreed) {
      pushNotice({ type: "error", text: "Please agree to the Terms and Privacy Policy to continue." });
      return;
    }

    setMethod(selected);
    setPaying(true);
    setNotice(null);

    try {
      // ✅ Placeholder — replace with your API call later:
      // const res = await fetch("/api/payments/init", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ provider: selected }),
      // });
      // const { url } = await res.json();
      // window.location.href = url;

      await new Promise((r) => setTimeout(r, 600));

      pushNotice({
        type: "info",
        text:
          selected === "paystack"
            ? "Paystack checkout will be wired here (placeholder)."
            : "Flutterwave checkout will be wired here (placeholder).",
      });
    } catch {
      pushNotice({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setPaying(false);
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">Loading checkout…</div>
      </main>
    );
  }

  const noticeStyle =
    notice?.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : notice?.type === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-zinc-200 bg-zinc-50 text-zinc-900";

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Checkout</h1>
              <p className="mt-1 text-sm text-zinc-600">
                You’re subscribing to <b>AceUTME Pro</b>.
              </p>
              {email && (
                <p className="mt-1 text-xs text-zinc-500">
                  Signed in as <span className="font-semibold">{email}</span>
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Billed monthly</span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                  Next charge: {formatDate(nextCharge)}
                </span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Cancel anytime</span>
              </div>
            </div>

            <a
              href="/"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              ← Back home
            </a>
          </div>

          {/* ✅ Inline notice (no alert popups) */}
          {notice && (
            <div className={`mt-5 flex items-start justify-between gap-3 rounded-xl border p-4 ${noticeStyle}`}>
              <div className="text-sm">
                <div className="font-semibold">
                  {notice.type === "error" ? "Action needed" : notice.type === "success" ? "Success" : "Info"}
                </div>
                <div className="mt-1">{notice.text}</div>
              </div>
              <button
                onClick={() => setNotice(null)}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Plan card */}
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">AceUTME Pro</div>
                <div className="mt-1 text-sm text-zinc-600">Full Mock UTME + advanced exam features</div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-extrabold text-zinc-900">{fmtNaira(PRICE_NGN)}</div>
                <div className="text-xs text-zinc-500">per month</div>
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-sm text-zinc-700">
              <li>✅ Full Mock UTME (180) with review screen</li>
              <li>✅ Flag questions + submit modal</li>
              <li>✅ Calculator (sciences) + draggable</li>
              <li>✅ AI explanations (optional)</li>
            </ul>

            <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Subtotal</span>
                <span className="font-semibold text-zinc-900">{fmtNaira(PRICE_NGN)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Total</span>
                <span className="font-semibold text-zinc-900">{fmtNaira(PRICE_NGN)}</span>
              </div>
              <div className="mt-2 text-xs text-zinc-500">Taxes/fees (if any) will be shown by the provider.</div>
            </div>
          </div>

          {/* Payment */}
          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Choose payment method</div>
                <p className="mt-1 text-sm text-zinc-600">You’ll be redirected to complete payment securely.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Card</span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Bank transfer</span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">USSD</span>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={paying}
              />
              <div className="text-sm text-zinc-700">
                I agree to the{" "}
                <a className="font-semibold underline" href="/terms">
                  Terms
                </a>{" "}
                and{" "}
                <a className="font-semibold underline" href="/privacy">
                  Privacy Policy
                </a>
                .
                <div className="mt-1 text-xs text-zinc-500">This is required to proceed.</div>
              </div>
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => handlePay("paystack")}
                disabled={paying || !agreed || alreadyPro}
                className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paying && method === "paystack" ? "Opening Paystack…" : "Pay with Paystack"}
              </button>

              <button
                onClick={() => handlePay("flutterwave")}
                disabled={paying || !agreed || alreadyPro}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paying && method === "flutterwave" ? "Opening Flutterwave…" : "Pay with Flutterwave"}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <b>Note:</b> These buttons are placeholders until you add Paystack/Flutterwave keys + an API route.
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Secure payment powered by your selected provider (Paystack/Flutterwave).
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <a
              href="/dashboard"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              Go to Dashboard
            </a>

            <a
              href="/"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Continue browsing
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
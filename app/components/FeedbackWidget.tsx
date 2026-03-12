"use client";

import { useMemo, useState } from "react";
import { supabase } from "../src/lib/supabaseClient";

type FeedbackCategory = "bug" | "payment" | "question" | "general";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const currentPage = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.pathname}${window.location.search}`;
  }, []);

  async function submitFeedback() {
    setStatus(null);

    if (!message.trim()) {
      setStatus("Please enter your feedback.");
      return;
    }

    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category,
          message: message.trim(),
          page: currentPage,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSending(false);
        setStatus(data?.error ?? "Failed to send feedback.");
        return;
      }

      setSending(false);
      setMessage("");
      setCategory("general");
      setStatus("Thanks. Your feedback has been sent.");
    } catch (e: any) {
      setSending(false);
      setStatus(e?.message ?? "Failed to send feedback.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white shadow-lg"
      >
        Send Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Send Feedback</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Tell us what is working, broken, or confusing.
                </p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-zinc-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
              >
                <option value="general">General</option>
                <option value="bug">Bug</option>
                <option value="payment">Payment</option>
                <option value="question">Question quality</option>
              </select>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-zinc-700">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Describe the issue or suggestion..."
                className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
              />
            </div>

            <div className="mt-3 text-xs text-zinc-500 break-all">
              Page: {currentPage || "unknown"}
            </div>

            {status && (
              <div className="mt-3 text-sm text-zinc-700">
                {status}
              </div>
            )}

            <button
              onClick={submitFeedback}
              disabled={sending}
              className="mt-5 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {sending ? "Sending..." : "Submit Feedback"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

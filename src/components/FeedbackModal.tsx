"use client";

import { useEffect, useState } from "react";

type FeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  user?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
};

export default function FeedbackModal({
  open,
  onClose,
  user,
}: FeedbackModalProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setStatus(null);
      setSending(false);
    }
  }, [open]);

  async function handleSendFeedback() {
    const cleanMessage = message.trim();

    if (!cleanMessage) {
      setStatus("Please enter your feedback.");
      return;
    }

    try {
      setSending(true);
      setStatus(null);

      const res = await fetch("/api/send-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanMessage,
          email: user?.email || "",
          name: user?.name || "",
          userId: user?.id || "",
          page: typeof window !== "undefined" ? window.location.pathname : "",
          category: "general",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to send feedback");
      }

      setStatus("Feedback sent successfully.");
      setMessage("");

      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setStatus(err?.message || "Failed to send feedback.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-3xl font-bold text-zinc-900">Feedback</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Tell us what is working or broken.
        </p>

        <textarea
          className="mt-5 min-h-[150px] w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your feedback..."
          disabled={sending}
        />

        {status && (
          <p
            className={`mt-3 text-sm ${
              status.toLowerCase().includes("success")
                ? "text-green-700"
                : "text-red-600"
            }`}
          >
            {status}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-xl border border-zinc-300 px-5 py-3 font-semibold text-zinc-900 disabled:opacity-60"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleSendFeedback}
            disabled={sending}
            className="rounded-xl bg-black px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}


"use client";

import { useState } from "react";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white shadow-lg"
      >
        Send Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h2 className="text-lg font-bold">Feedback</h2>

            <p className="text-sm text-zinc-600 mt-2">
              Tell us what is working or broken.
            </p>

            <textarea
              className="w-full border rounded-lg p-3 mt-4"
              rows={4}
              placeholder="Your feedback..."
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setOpen(false)}
                className="border px-4 py-2 rounded"
              >
                Close
              </button>

              <button className="bg-black text-white px-4 py-2 rounded">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

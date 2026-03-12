"use client";

import { useState } from "react";

export default function BetaBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between text-sm">
        <div>
          ⚠️ <b>AceUTME Beta:</b> You are testing an early version of the platform.
          Features, questions, and pricing may change during testing.
        </div>

        <button
          onClick={() => setVisible(false)}
          className="ml-4 text-xs px-2 py-1 border border-amber-300 rounded hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
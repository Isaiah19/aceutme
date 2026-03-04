"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function AdminLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin/upload";

  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setMsg(null);
    setLoading(true);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setMsg(data?.error ?? "Login failed");
      return;
    }

    router.push(next);
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Admin Login</h1>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <label className="text-sm font-medium text-zinc-700">
            Admin Password
          </label>

          <input
            type="password"
            className="mt-2 w-full rounded-xl border border-zinc-300 p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
          />

          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

          <button
            onClick={login}
            disabled={!password || loading}
            className="mt-5 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}

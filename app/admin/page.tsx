"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function login() {
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoading(false);
        setMsg(data?.error ?? "Login failed");
        return;
      }

      setLoading(false);
      router.push("/admin/upload");
    } catch (e: any) {
      setLoading(false);
      setMsg(e?.message ?? "Login failed");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Admin Login</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Enter admin password to continue.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <label className="text-sm font-medium text-zinc-700">
            Admin password
          </label>
          <input
            type="password"
            className="mt-2 w-full rounded-xl border border-zinc-300 p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

          <button
            onClick={login}
            disabled={!password || loading}
            className="mt-5 w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          <a className="mt-4 block text-center text-sm text-zinc-600 underline" href="/dashboard">
            Back to Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

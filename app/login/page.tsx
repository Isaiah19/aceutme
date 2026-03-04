"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

function asEmail(input: string) {
  const v = input.trim();
  if (v.includes("@")) return v.toLowerCase(); // allow real email too
  return `${v.toLowerCase().replace(/\s+/g, "")}@aceutme.local`;
}

export default function LoginPage() {
  const router = useRouter();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!usernameOrEmail.trim() || !password) {
      setMsg("Enter your username and password.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: asEmail(usernameOrEmail),
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Login</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Enter your username and password.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 rounded-2xl bg-white p-6 shadow-sm"
        >
          <label className="text-sm font-medium text-zinc-700">
            Username
          </label>
          <input
            className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            placeholder="e.g. isaiah"
            autoComplete="username"
          />

          <label className="mt-4 block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

          <button
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          <p className="mt-4 text-center text-sm text-zinc-600">
            No account?{" "}
            <Link className="underline" href="/signup">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

function usernameToEmail(username: string) {
  const clean = username.trim().toLowerCase().replace(/\s+/g, "");
  return `${clean}@aceutme.local`;
}

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const u = username.trim();
    if (u.length < 3) {
      setMsg("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const email = usernameToEmail(u);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: u }, // store username in user_metadata
      },
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // Go to dashboard (has Practice + Mock links)
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Create account</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Use a username and password. (No email required.)
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            autoComplete="new-password"
          />

          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

          <button
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
          >
            {loading ? "Creating..." : "Get Started"}
          </button>

          <p className="mt-4 text-center text-sm text-zinc-600">
            Already have an account?{" "}
            <Link className="underline" href="/login">
              Login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";

type LoginMode = "email" | "phone";

const COUNTRY_CODES = [
  { code: "+234", label: "Nigeria (+234)" },
  { code: "+1", label: "USA/Canada (+1)" },
  { code: "+44", label: "UK (+44)" },
  { code: "+233", label: "Ghana (+233)" },
  { code: "+254", label: "Kenya (+254)" },
  { code: "+27", label: "South Africa (+27)" },
];

function normalizePhone(countryCode: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  const trimmed = digits.startsWith("0") ? digits.slice(1) : digits;
  return `${countryCode}${trimmed}`;
}

export default function LoginPage() {
  const router = useRouter();

  const [loginMode, setLoginMode] = useState<LoginMode>("email");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+234");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const normalizedPhone = useMemo(
    () => normalizePhone(countryCode, phone),
    [countryCode, phone]
  );

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const payload =
        loginMode === "email"
          ? { email: email.trim().toLowerCase(), password }
          : { phone: normalizedPhone, password };

      const { error } = await supabase.auth.signInWithPassword(payload as any);

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setLoading(false);
      router.push("/dashboard");
    } catch (err: any) {
      setMsg(err?.message ?? "Login failed.");
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMsg(null);

    if (loginMode !== "email") {
      setMsg("Password reset is currently available for email login only.");
      return;
    }

    if (!email.trim()) {
      setMsg("Enter your email address first, then click Forgot Password.");
      return;
    }

    setResetting(true);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );

      if (error) {
        setMsg(error.message);
        setResetting(false);
        return;
      }

      setMsg("Password reset link sent. Check your email.");
      setResetting(false);
    } catch (err: any) {
      setMsg(err?.message ?? "Unable to send reset link.");
      setResetting(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          Login
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          Enter your email or phone number and password.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-5">
          <div>
            <label className="text-sm font-medium text-zinc-700">
              Login type
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLoginMode("email")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  loginMode === "email"
                    ? "border-black bg-black text-white"
                    : "border-zinc-300 bg-white text-zinc-900"
                }`}
              >
                Email
              </button>

              <button
                type="button"
                onClick={() => setLoginMode("phone")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  loginMode === "phone"
                    ? "border-black bg-black text-white"
                    : "border-zinc-300 bg-white text-zinc-900"
                }`}
              >
                Phone number
              </button>
            </div>
          </div>

          {loginMode === "email" ? (
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Email
              </label>
              <input
                type="email"
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Phone number
              </label>
              <div className="mt-2 grid grid-cols-[170px_1fr] gap-3">
                <select
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  {COUNTRY_CODES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="8012345678"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-zinc-700">
              Password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetting}
              className="text-sm font-medium text-zinc-700 underline disabled:opacity-60"
            >
              {resetting ? "Sending reset link..." : "Forgot Password?"}
            </button>
          </div>

          {msg && (
            <p
              className={`text-sm ${
                msg.toLowerCase().includes("sent")
                  ? "text-green-700"
                  : "text-red-600"
              }`}
            >
              {msg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          No account?{" "}
          <Link href="/signup" className="font-medium underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
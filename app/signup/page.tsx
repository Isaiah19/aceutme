"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";

type AuthMode = "email" | "phone";

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

export default function SignupPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("email");

  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+234");
  const [phone, setPhone] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const normalizedPhone = useMemo(
    () => normalizePhone(countryCode, phone),
    [countryCode, phone]
  );

  function validate() {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";

    if (authMode === "email") {
      if (!email.trim()) return "Email is required.";
    } else {
      if (!phone.trim()) return "Phone number is required.";
      if (normalizedPhone.length < 10) return "Enter a valid phone number.";
    }

    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";

    return null;
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    const validationError = validate();
    if (validationError) {
      setMsg(validationError);
      return;
    }

    setLoading(true);

    try {
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      const cleanEmail = email.trim().toLowerCase();

      const metadata = {
        first_name: cleanFirstName,
        last_name: cleanLastName,
        full_name: `${cleanFirstName} ${cleanLastName}`.trim(),
        login_type: authMode,
        username: authMode === "email" ? cleanEmail : normalizedPhone,
        plan: "free",
        is_premium: false,
      };

      const payload =
        authMode === "email"
          ? {
              email: cleanEmail,
              password,
              options: { data: metadata },
            }
          : {
              phone: normalizedPhone,
              password,
              options: { data: metadata },
            };

      const { data, error } = await supabase.auth.signUp(payload as any);

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      if (authMode === "email" && cleanEmail) {
        try {
          await fetch("/api/send-welcome-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: cleanEmail,
              firstName: cleanFirstName,
              userId: data?.user?.id ?? null,
            }),
          });
        } catch (emailError) {
          console.error("Welcome email failed:", emailError);
        }
      }

      setLoading(false);
      setMsg(
        authMode === "email"
          ? "Account created successfully. Your account starts on the Free plan. A welcome email has been sent if email delivery is configured. You can now log in."
          : "Account created successfully. Your account starts on the Free plan. If phone confirmation is enabled, verify your phone and then log in."
      );

      setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (err: any) {
      setMsg(err?.message ?? "Signup failed.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          Create account
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          Sign up with your email or phone number. New accounts start on the Free plan.
        </p>

        <form onSubmit={handleSignup} className="mt-8 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700">
                First name
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Isaiah"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-700">
                Last name
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nweze"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">
              Username type
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAuthMode("email")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  authMode === "email"
                    ? "border-black bg-black text-white"
                    : "border-zinc-300 bg-white text-zinc-900"
                }`}
              >
                Email
              </button>

              <button
                type="button"
                onClick={() => setAuthMode("phone")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  authMode === "phone"
                    ? "border-black bg-black text-white"
                    : "border-zinc-300 bg-white text-zinc-900"
                }`}
              >
                Phone number
              </button>
            </div>
          </div>

          {authMode === "email" ? (
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
              <p className="mt-2 text-xs text-zinc-500">
                Full number: {normalizedPhone || "—"}
              </p>
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

          <div>
            <label className="text-sm font-medium text-zinc-700">
              Confirm Password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-black"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
            />
          </div>

          {msg && (
            <p
              className={`text-sm ${
                msg.toLowerCase().includes("success")
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
            {loading ? "Creating account..." : "Get Started"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}

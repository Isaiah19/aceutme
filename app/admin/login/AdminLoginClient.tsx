"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../src/lib/supabaseClient";

export default function AdminLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = searchParams.get("next") || "/admin/upload";

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin,email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      if (!profile?.is_admin) {
        setMsg("You do not have admin access for this account.");
        setLoading(false);
        return;
      }

      router.replace(next);
    })();
  }, [next, router]);

  async function goToLogin() {
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  async function goToDashboard() {
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Admin Access</h1>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-zinc-600">Checking admin access...</p>
          ) : msg ? (
            <>
              <p className="text-sm text-red-600">{msg}</p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={goToLogin}
                  className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                >
                  Login with admin account
                </button>

                <button
                  onClick={goToDashboard}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
                >
                  Back to Dashboard
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-600">Redirecting...</p>
          )}
        </div>
      </div>
    </main>
  );
}
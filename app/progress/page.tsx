"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type AttemptRow = {
  id: number;
  question_id: number;
  selected_option: string;
  is_correct: boolean;
  created_at: string;
};

export default function ProgressPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("attempts")
        .select("id, question_id, selected_option, is_correct, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setAttempts((data ?? []) as AttemptRow[]);
      setLoading(false);
    })();
  }, [router]);

  const stats = useMemo(() => {
    const total = attempts.length;
    const correct = attempts.filter((a) => a.is_correct).length;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    return { total, correct, accuracy };
  }, [attempts]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">Your Progress</h1>
          <a className="text-sm text-zinc-600 underline" href="/dashboard">
            Back to Dashboard
          </a>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-sm text-zinc-500">Total attempts</div>
            <div className="mt-1 text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-sm text-zinc-500">Correct</div>
            <div className="mt-1 text-2xl font-bold">{stats.correct}</div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-sm text-zinc-500">Accuracy</div>
            <div className="mt-1 text-2xl font-bold">{stats.accuracy}%</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent attempts</h2>

          {loading && <p className="mt-3">Loading...</p>}
          {!loading && msg && <p className="mt-3 text-red-600">{msg}</p>}

          {!loading && !msg && attempts.length === 0 && (
            <p className="mt-3 text-zinc-600">No attempts yet. Go practice!</p>
          )}

          {!loading && attempts.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Question ID</th>
                    <th className="py-2 pr-4">Your Option</th>
                    <th className="py-2 pr-4">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.slice(0, 20).map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 text-zinc-600">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">{a.question_id}</td>
                      <td className="py-2 pr-4">{a.selected_option}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold text-white ${
                            a.is_correct ? "bg-green-600" : "bg-red-600"
                          }`}
                        >
                          {a.is_correct ? "Correct" : "Wrong"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6">
          <a
            className="inline-block rounded-lg bg-black px-4 py-2 text-white"
            href="/practice/select"
          >
            Continue practice
          </a>
        </div>
      </div>
    </main>
  );
}
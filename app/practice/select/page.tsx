"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Subject = {
  id: number;
  name: string;
  qcount: number;
};

const LAST_PRACTICE_KEY = "last_practice_subject_href";

export default function PracticeSelectPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [lastPracticeHref, setLastPracticeHref] = useState<string | null>(null);

  useEffect(() => {
    // read last practice
    if (typeof window !== "undefined") {
      const href = localStorage.getItem(LAST_PRACTICE_KEY);
      setLastPracticeHref(href && href.startsWith("/") ? href : null);
    }

    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data: subs, error: subErr } = await supabase
        .from("subjects")
        .select("id,name")
        .order("name", { ascending: true });

      if (subErr) {
        setMsg(subErr.message);
        setLoading(false);
        return;
      }

      const base = (subs ?? []) as { id: number; name: string }[];

      // Count questions per subject
      const withCounts: Subject[] = [];
      for (const s of base) {
        const { count, error: cErr } = await supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", s.id);

        if (cErr) {
          setMsg(cErr.message);
          setLoading(false);
          return;
        }

        withCounts.push({ id: s.id, name: s.name, qcount: count ?? 0 });
      }

      setSubjects(withCounts);
      setLoading(false);
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.name.toLowerCase().includes(q));
  }, [subjects, search]);

  function startSubject(subjectId: number, qcount: number) {
    if (qcount <= 0) return;

    const href = `/practice?subjectId=${subjectId}`;

    // ✅ Save for dashboard “Continue Practice”
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_PRACTICE_KEY, href);
    }

    router.push(href);
  }

  function resumeLastPractice() {
    if (!lastPracticeHref) return;
    router.push(lastPracticeHref);
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Practice</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Choose a subject to start practicing JAMB-standard questions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {lastPracticeHref && (
              <button
                onClick={resumeLastPractice}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Resume last practice
              </button>
            )}
            <a
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
              href="/dashboard"
            >
              Back to Dashboard
            </a>
          </div>
        </div>

        {/* Card */}
        <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-zinc-700">
              Subjects with <span className="font-semibold">0 questions</span> are disabled.
            </div>

            <input
              className="w-full rounded-xl border border-zinc-300 p-3 text-sm sm:max-w-md"
              placeholder="Search subjects… (e.g., Biology, Chemistry)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && <p className="mt-4 text-sm text-zinc-600">Loading subjects…</p>}
          {!loading && msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

          {!loading && !msg && filtered.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">No subjects found.</p>
          )}

          {!loading && !msg && filtered.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => {
                const disabled = s.qcount <= 0;

                return (
                  <button
                    key={s.id}
                    onClick={() => startSubject(s.id, s.qcount)}
                    disabled={disabled}
                    className={`group rounded-2xl border p-4 text-left transition ${
                      disabled
                        ? "border-zinc-200 bg-zinc-50 opacity-60"
                        : "border-zinc-200 bg-white hover:border-black hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-zinc-900">{s.name}</div>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold text-white ${
                          disabled ? "bg-zinc-400" : "bg-emerald-600"
                        }`}
                      >
                        {s.qcount} Q
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-zinc-600">
                      {disabled ? "No questions yet" : "Tap to practice"}
                    </div>

                    {!disabled && (
                      <div className="mt-3 text-xs font-semibold text-zinc-900 opacity-80 group-hover:opacity-100">
                        Start →
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
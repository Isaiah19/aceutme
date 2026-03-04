"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "jamb_full_cbt_state_v5";

type BySubject = Record<
  string,
  { correct: number; wrong: number; unanswered: number; total: number }
>;

type StoredResult = {
  totalCorrect: number;
  totalWrong: number;
  totalUnanswered: number;
  total: number;
  bySubject: BySubject;
};

type StoredState = {
  submitted?: boolean;
  result?: StoredResult | null;
  msg?: string | null;
};

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function cn(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export default function ExamSubmittedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<StoredResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      router.replace("/cbt/full");
      return;
    }

    try {
      const saved = JSON.parse(raw) as StoredState;

      if (!saved.submitted || !saved.result) {
        router.replace("/cbt/full");
        return;
      }

      setResult(saved.result);
      setMsg(typeof saved.msg === "string" ? saved.msg : null);
    } catch {
      router.replace("/cbt/full");
      return;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const overall = useMemo(() => {
    if (!result) return null;
    const attempted = result.totalCorrect + result.totalWrong;
    const scorePct = pct(result.totalCorrect, result.total);
    const accuracyPct = attempted ? pct(result.totalCorrect, attempted) : 0;

    return { attempted, scorePct, accuracyPct };
  }, [result]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f2f4f7] p-8">
        <div className="mx-auto max-w-5xl text-zinc-700">Loading results...</div>
      </main>
    );
  }

  if (!result || !overall) return null;

  return (
    <main className="min-h-screen bg-[#f2f4f7]">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-600 text-white">
              ✓
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
                Exam Submitted
              </h1>
              <p className="text-sm text-zinc-600">
                Your result summary is shown below.
              </p>
            </div>
          </div>

          {msg && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {msg}
            </div>
          )}
        </div>

        {/* Overall Summary */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Overall</div>
              <div className="mt-1 text-sm text-zinc-600">
                Total questions: <b className="text-zinc-900">{result.total}</b>
              </div>
            </div>

            {/* Big score */}
            <div className="text-right">
              <div className="text-sm text-zinc-600">Score</div>
              <div className="text-3xl font-extrabold text-zinc-900">
                {result.totalCorrect}{" "}
                <span className="text-zinc-400 text-lg font-semibold">
                  / {result.total}
                </span>
              </div>
              <div className="text-sm font-semibold text-zinc-700">
                {overall.scorePct}% overall
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-5">
            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-3 rounded-full bg-green-600"
                style={{ width: `${overall.scorePct}%` }}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <StatChip label="Attempted" value={overall.attempted} tone="zinc" />
              <StatChip label="Passed" value={result.totalCorrect} tone="green" />
              <StatChip label="Failed" value={result.totalWrong} tone="red" />
              <StatChip label="Unanswered" value={result.totalUnanswered} tone="zinc" />
            </div>

            <div className="mt-3 text-xs text-zinc-600">
              Accuracy (based on attempted):{" "}
              <b className="text-zinc-900">{overall.accuracyPct}%</b>
            </div>
          </div>
        </div>

        {/* Subject-wise */}
        <div className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-900">Subject-wise Results</h2>
            <div className="text-xs text-zinc-600">
              Tip: Higher attempted questions usually improves your overall score.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(result.bySubject).map(([subject, r]) => {
              const attempted = r.correct + r.wrong;
              const scorePct = pct(r.correct, r.total);
              const accuracyPct = attempted ? pct(r.correct, attempted) : 0;

              return (
                <div key={subject} className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-zinc-900">{subject}</div>
                      <div className="text-xs text-zinc-600">
                        Total: <b className="text-zinc-900">{r.total}</b> • Attempted:{" "}
                        <b className="text-zinc-900">{attempted}</b>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-zinc-600">Score</div>
                      <div className="text-xl font-extrabold text-zinc-900">
                        {r.correct}
                        <span className="text-zinc-400 text-sm font-semibold">/{r.total}</span>
                      </div>
                      <div className="text-xs font-semibold text-zinc-700">{scorePct}%</div>
                    </div>
                  </div>

                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-2 rounded-full bg-green-600" style={{ width: `${scorePct}%` }} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MiniChip label="Passed" value={r.correct} tone="green" />
                    <MiniChip label="Failed" value={r.wrong} tone="red" />
                    <MiniChip label="Unanswered" value={r.unanswered} tone="zinc" />
                  </div>

                  <div className="mt-3 text-xs text-zinc-600">
                    Accuracy: <b className="text-zinc-900">{accuracyPct}%</b>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Go to Dashboard
          </button>

          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              router.push("/cbt/full");
            }}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Start New Exam
          </button>
        </div>
      </div>
    </main>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "zinc";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-extrabold",
          tone === "green" && "text-green-700",
          tone === "red" && "text-red-700",
          tone === "zinc" && "text-zinc-900"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "zinc";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        tone === "green" && "border-green-200 bg-green-50",
        tone === "red" && "border-red-200 bg-red-50",
        tone === "zinc" && "border-zinc-200 bg-zinc-50"
      )}
    >
      <div className="text-[11px] font-semibold text-zinc-600">{label}</div>
      <div
        className={cn(
          "text-sm font-extrabold",
          tone === "green" && "text-green-800",
          tone === "red" && "text-red-800",
          tone === "zinc" && "text-zinc-900"
        )}
      >
        {value}
      </div>
    </div>
  );
}
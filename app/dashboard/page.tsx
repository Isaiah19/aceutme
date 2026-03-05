"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type RecentAttempt = {
  id: number;
  question_id: number;
  selected_option: string;
  is_correct: boolean;
  created_at: string;
};

const CBT_STORAGE_KEY = "jamb_full_cbt_state_v5";
const LAST_PRACTICE_KEY = "last_practice_subject_href";

function fmtTime(s: number) {
  const ss = Math.max(0, Math.floor(s));
  const h = Math.floor(ss / 3600);
  const m = Math.floor((ss % 3600) / 60);
  const sec = ss % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function subjectFromIndex(index: number) {
  const n = index + 1;
  if (n <= 60) return "English";
  if (n <= 100) return "Mathematics";
  if (n <= 140) return "Physics";
  if (n <= 180) return "Chemistry";
  return "—";
}

// ✅ helpers for weekly stats
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoDayKey(d: Date) {
  // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // ✅ Dashboard Stats
  const [attemptsCount, setAttemptsCount] = useState<number>(0);
  const [totalCorrect, setTotalCorrect] = useState<number>(0);
  const [totalWrong, setTotalWrong] = useState<number>(0);

  // ✅ NEW: streak + weekly stats
  const [streak, setStreak] = useState<number>(0);
  const [weekTotal, setWeekTotal] = useState<number>(0);
  const [weekAccuracy, setWeekAccuracy] = useState<number>(0);
  const [weekSeries, setWeekSeries] = useState<
    { day: string; attempts: number; correct: number; accuracy: number }[]
  >([]);

  // Recent Activity (last 8)
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([]);
  const [correctRecent, setCorrectRecent] = useState<number>(0);

  const [lastPracticeHref, setLastPracticeHref] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mock session state
  const [hasSavedMock, setHasSavedMock] = useState(false);
  const [canContinueMock, setCanContinueMock] = useState(false);
  const [savedMockInfo, setSavedMockInfo] = useState<{
    answered: number;
    total: number;
    timeLeft: number;
    submitted: boolean;
    currentIndex: number;
    currentSubject: string;
  } | null>(null);

  const isAdmin = useMemo(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin_ok") === "1";
  }, []);

  const recentAccuracy = useMemo(() => {
    if (!recentAttempts.length) return 0;
    return Math.round((correctRecent / recentAttempts.length) * 100);
  }, [correctRecent, recentAttempts.length]);

  const overallAccuracy = useMemo(() => {
    if (!attemptsCount) return 0;
    return Math.round((totalCorrect / attemptsCount) * 100);
  }, [attemptsCount, totalCorrect]);

  const readLastPractice = useCallback(() => {
    if (typeof window === "undefined") return;
    const href = localStorage.getItem(LAST_PRACTICE_KEY);
    setLastPracticeHref(href && href.startsWith("/") ? href : null);
  }, []);

  const readSavedMock = useCallback((currentUserId: string) => {
    if (typeof window === "undefined") return;

    const raw = localStorage.getItem(CBT_STORAGE_KEY);
    if (!raw) {
      setHasSavedMock(false);
      setCanContinueMock(false);
      setSavedMockInfo(null);
      return;
    }

    try {
      const saved = JSON.parse(raw);

      if (saved?.userId && saved.userId !== currentUserId) {
        setHasSavedMock(false);
        setCanContinueMock(false);
        setSavedMockInfo(null);
        return;
      }

      const answers = saved?.answers ?? {};
      const answered = Object.keys(answers).length;

      const ids: number[] = Array.isArray(saved?.questionIds) ? saved.questionIds : [];
      const total = ids.length || 180;

      const endTimeMs = typeof saved?.endTimeMs === "number" ? saved.endTimeMs : null;
      const timeLeft = endTimeMs ? Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000)) : 0;

      const submitted = !!saved?.submitted;
      const currentIndex = typeof saved?.currentIndex === "number" ? saved.currentIndex : 0;
      const currentSubject = subjectFromIndex(currentIndex);

      setHasSavedMock(true);
      setSavedMockInfo({ answered, total, timeLeft, submitted, currentIndex, currentSubject });

      const ok = !submitted && timeLeft > 0 && total === 180;
      setCanContinueMock(ok);
    } catch {
      setHasSavedMock(false);
      setCanContinueMock(false);
      setSavedMockInfo(null);
    }
  }, []);

  // ✅ Stats loader (TOTAL attempts + correct + wrong)
  const loadStats = useCallback(async (uid: string) => {
    try {
      const [{ count: allCount }, { count: correctCount }] = await Promise.all([
        supabase.from("attempts").select("id", { head: true, count: "exact" }).eq("user_id", uid),
        supabase
          .from("attempts")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", uid)
          .eq("is_correct", true),
      ]);

      const total = typeof allCount === "number" ? allCount : 0;
      const correct = typeof correctCount === "number" ? correctCount : 0;

      setAttemptsCount(total);
      setTotalCorrect(correct);
      setTotalWrong(Math.max(0, total - correct));
    } catch {
      // ignore
    }
  }, []);

  // ✅ Recent attempts + streak
  const loadRecentAttempts = useCallback(async (uid: string) => {
    try {
      // Fetch more than 8 so streak can be computed properly
      const { data: rows, error } = await supabase
        .from("attempts")
        .select("id,question_id,selected_option,is_correct,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error) {
        const list = (rows ?? []) as RecentAttempt[];

        // Recent table still shows last 8
        const last8 = list.slice(0, 8);
        setRecentAttempts(last8);
        setCorrectRecent(last8.reduce((acc, r) => acc + (r.is_correct ? 1 : 0), 0));

        // ✅ streak: consecutive correct from most recent going backwards
        let s = 0;
        for (const a of list) {
          if (a.is_correct) s += 1;
          else break;
        }
        setStreak(s);
      }
    } catch {
      // ignore
    }
  }, []);

  // ✅ Weekly stats: last 7 days attempts + accuracy per day
  const loadWeeklyStats = useCallback(async (uid: string) => {
    try {
      const now = new Date();
      const start = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)); // 7 days incl today

      const { data, error } = await supabase
        .from("attempts")
        .select("created_at,is_correct")
        .eq("user_id", uid)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true });

      if (error) return;

      // Build buckets for 7 days (including 0s)
      const days: { key: string; label: string }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        const key = isoDayKey(d);
        const label = d.toLocaleDateString(undefined, { weekday: "short" }); // Mon, Tue…
        days.push({ key, label });
      }

      const map: Record<string, { attempts: number; correct: number }> = {};
      for (const d of days) map[d.key] = { attempts: 0, correct: 0 };

      for (const row of data ?? []) {
        const k = isoDayKey(new Date(row.created_at));
        if (!map[k]) continue;
        map[k].attempts += 1;
        if (row.is_correct) map[k].correct += 1;
      }

      const series = days.map((d) => {
        const a = map[d.key].attempts;
        const c = map[d.key].correct;
        return {
          day: d.label,
          attempts: a,
          correct: c,
          accuracy: a ? Math.round((c / a) * 100) : 0,
        };
      });

      const totalA = series.reduce((acc, x) => acc + x.attempts, 0);
      const totalC = series.reduce((acc, x) => acc + x.correct, 0);

      setWeekSeries(series);
      setWeekTotal(totalA);
      setWeekAccuracy(totalA ? Math.round((totalC / totalA) * 100) : 0);
    } catch {
      // ignore
    }
  }, []);

  const refreshAll = useCallback(
    async (uid: string) => {
      await Promise.all([loadStats(uid), loadRecentAttempts(uid), loadWeeklyStats(uid)]);
      readLastPractice();
      readSavedMock(uid);
    },
    [loadStats, loadRecentAttempts, loadWeeklyStats, readLastPractice, readSavedMock]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      const uid = data.user.id;
      setUserId(uid);
      setEmail(data.user.email ?? "");

      await refreshAll(uid);

      setLoading(false);
    })();
  }, [router, refreshAll]);

  useEffect(() => {
    if (!userId) return;

    const onFocus = async () => {
      await refreshAll(userId);
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === CBT_STORAGE_KEY || e.key === LAST_PRACTICE_KEY) {
        readLastPractice();
        readSavedMock(userId);
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    const interval = window.setInterval(() => {
      refreshAll(userId);
    }, 15000);

    const channel = supabase
      .channel(`attempts-feed-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attempts", filter: `user_id=eq.${userId}` },
        async () => {
          await refreshAll(userId);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId, refreshAll, readLastPractice, readSavedMock]);

  async function logout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function continuePractice() {
    if (lastPracticeHref) router.push(lastPracticeHref);
    else router.push("/practice/select");
  }

  function startNewMock() {
    localStorage.removeItem(CBT_STORAGE_KEY);
    router.push("/cbt/full");
  }

  function continueMock() {
    router.push("/cbt/full");
  }

  function resetMockOnly() {
    localStorage.removeItem(CBT_STORAGE_KEY);
    readSavedMock(userId);
  }

  const nav = [
    { label: "Home", href: "/" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Practice", href: "/practice/select" },
    { label: "Progress", href: "/progress" },
    { label: "Full Mock", href: "/cbt/full" },
    ...(isAdmin ? [{ label: "Admin Upload", href: "/admin/upload" }] : []),
  ];

  function SidebarContent() {
    return (
      <aside className="h-full rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-black text-white font-bold">A</div>
          <div>
            <div className="font-semibold text-zinc-900">AceUTME</div>
            <div className="text-xs text-zinc-500">JAMB CBT Simulator</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-zinc-50 p-3">
          <div className="text-xs text-zinc-500">Signed in</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900 break-all">{email}</div>
        </div>

        <nav className="mt-4 space-y-1">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`block rounded-xl px-3 py-2 text-sm font-semibold ${
                item.href === "/dashboard" ? "bg-black text-white" : "text-zinc-900 hover:bg-zinc-100"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <button
          onClick={logout}
          disabled={loggingOut}
          className="mt-4 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </aside>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-6xl p-8">
          <div className="rounded-2xl bg-white p-6 shadow-sm">Loading dashboard…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold">
            ☰ Menu
          </button>

          <div className="text-sm font-semibold text-zinc-900">Dashboard</div>

          <a href="/cbt/full" className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">
            Full Mock
          </a>
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[320px] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-sm font-semibold text-white">Menu</div>
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold">
                Close
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="hidden lg:block">
            <SidebarContent />
          </div>

          <section className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-900">Welcome back!</h1>
                  <p className="mt-1 text-sm text-zinc-600">Your stats update automatically as you practice.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href="/"
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                  >
                    ← Home
                  </a>

                  <button onClick={continuePractice} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
                    {lastPracticeHref ? "Continue Practice" : "Start Practice"}
                  </button>

                  <a href="/progress" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
                    View Progress
                  </a>
                </div>
              </div>
            </div>

            {/* ✅ STATS */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Attempts</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{attemptsCount}</div>
                <div className="mt-1 text-xs text-zinc-500">Total questions answered</div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Overall accuracy</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{overallAccuracy}%</div>
                <div className="mt-1 text-xs text-zinc-500">Based on all attempts</div>
              </div>

              {/* ✅ NEW */}
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Current streak</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{streak}</div>
                <div className="mt-1 text-xs text-zinc-500">Consecutive correct (latest)</div>
              </div>

              {/* ✅ NEW */}
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Last 7 days</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{weekAccuracy}%</div>
                <div className="mt-1 text-xs text-zinc-500">{weekTotal} attempts this week</div>
              </div>
            </div>

            {/* ✅ Last 7 days mini breakdown */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-zinc-900">Last 7 days</div>
                  <div className="text-sm text-zinc-600">Attempts + accuracy per day</div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr>
                      <th className="py-2">Day</th>
                      <th className="py-2">Attempts</th>
                      <th className="py-2">Correct</th>
                      <th className="py-2">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekSeries.map((d, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="py-3 font-medium text-zinc-900">{d.day}</td>
                        <td className="py-3 text-zinc-700">{d.attempts}</td>
                        <td className="py-3 text-zinc-700">{d.correct}</td>
                        <td className="py-3">
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-800">
                            {d.accuracy}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                All-time: <span className="font-semibold">{totalCorrect}</span> correct •{" "}
                <span className="font-semibold">{totalWrong}</span> wrong
              </div>
            </div>

            {/* (Everything else below stays the same in your file) */}
            {/* Continue mock + Recent Activity blocks... */}
            {/* ✅ Keep your existing blocks as-is below this line */}
          </section>
        </div>
      </div>
    </main>
  );
}
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

const CBT_STORAGE_KEY = "jamb_full_cbt_state_v1";
const LAST_PRACTICE_KEY = "last_practice_subject_href";

function fmtTime(s: number) {
  const ss = Math.max(0, Math.floor(s));
  const h = Math.floor(ss / 3600);
  const m = Math.floor((ss % 3600) / 60);
  const sec = ss % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// based on JAMB order: English 60, then 3 subjects x40
function subjectFromIndex(index: number) {
  const n = index + 1; // 1-based
  if (n <= 60) return "English";
  if (n <= 100) return "Mathematics";
  if (n <= 140) return "Physics";
  if (n <= 180) return "Chemistry";
  return "—";
}

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [attemptsCount, setAttemptsCount] = useState<number>(0);
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

  const accuracy = useMemo(() => {
    if (!recentAttempts.length) return 0;
    return Math.round((correctRecent / recentAttempts.length) * 100);
  }, [correctRecent, recentAttempts.length]);

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

      // must be same user (avoid leaking another user's saved session on shared PC)
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

      // Continue allowed only if not submitted + still has time + has 180 q order
      const ok = !submitted && timeLeft > 0 && total === 180;
      setCanContinueMock(ok);
    } catch {
      setHasSavedMock(false);
      setCanContinueMock(false);
      setSavedMockInfo(null);
    }
  }, []);

  const loadAttempts = useCallback(async (uid: string) => {
    try {
      const { data: rows, error } = await supabase
        .from("attempts")
        .select("id,question_id,selected_option,is_correct,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(8);

      if (!error) {
        const list = (rows ?? []) as RecentAttempt[];
        setRecentAttempts(list);
        setCorrectRecent(list.reduce((acc, r) => acc + (r.is_correct ? 1 : 0), 0));
      }

      const { count } = await supabase
        .from("attempts")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", uid);

      if (typeof count === "number") setAttemptsCount(count);
    } catch {
      // ignore
    }
  }, []);

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

      await loadAttempts(uid);
      readLastPractice();
      readSavedMock(uid);

      setLoading(false);
    })();
  }, [router, loadAttempts, readLastPractice, readSavedMock]);

  // ✅ NEW: Supabase Realtime for attempts (instant update for cards)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`attempts-dashboard-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attempts",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // Refresh attempts + derived stats immediately
          await loadAttempts(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadAttempts]);

  // Refresh dashboard whenever user returns to tab, or when localStorage changes (mock/practice)
  useEffect(() => {
    if (!userId) return;

    const onFocus = async () => {
      await loadAttempts(userId);
      readLastPractice();
      readSavedMock(userId);
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

    // lightweight polling so it feels “live” even without focus changes
    const interval = window.setInterval(() => {
      loadAttempts(userId);
      readSavedMock(userId);
    }, 15000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [userId, loadAttempts, readLastPractice, readSavedMock]);

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

  // ✅ UPDATED: remove "Admin Login" from normal user dashboard
  // Only show admin upload if already admin (admin_ok=1). Otherwise show nothing.
  const nav = [
    { label: "Home", href: "/" }, // ✅ back to landing page
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
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold"
          >
            ☰ Menu
          </button>

          <div className="text-sm font-semibold text-zinc-900">Dashboard</div>

          <a href="/cbt/full" className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">
            Full Mock
          </a>
        </div>
      </div>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[320px] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-sm font-semibold text-white">Menu</div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Desktop sidebar */}
          <div className="hidden lg:block">
            <SidebarContent />
          </div>

          {/* Main */}
          <section className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-900">Welcome back!</h1>
                  <p className="mt-1 text-sm text-zinc-600">Continue your preparation from where you stopped.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* back to landing/home page */}
                  <a
                    href="/"
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                  >
                    ← Home
                  </a>

                  <button onClick={continuePractice} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
                    {lastPracticeHref ? "Continue Practice" : "Start Practice"}
                  </button>

                  <a
                    href="/progress"
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                  >
                    View Progress
                  </a>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Attempts</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{attemptsCount}</div>
                <div className="mt-1 text-xs text-zinc-500">Total questions answered</div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Recent accuracy</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{accuracy}%</div>
                <div className="mt-1 text-xs text-zinc-500">Based on your last 8 attempts</div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-medium text-zinc-500">Account</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">Active</div>
                <div className="mt-1 text-xs text-zinc-500 break-all">{email}</div>
              </div>
            </div>

            {/* Continue mock */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-zinc-900">Full Mock Session</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {hasSavedMock ? "We found a saved mock session on this device." : "No saved mock session found yet."}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canContinueMock ? (
                    <>
                      <button onClick={continueMock} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                        Continue last mock
                      </button>
                      <button
                        onClick={startNewMock}
                        className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                      >
                        Start new mock
                      </button>
                      <button
                        onClick={resetMockOnly}
                        className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                        title="Clear saved mock session on this device"
                      >
                        Reset saved mock
                      </button>
                    </>
                  ) : (
                    <button onClick={startNewMock} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                      Start full mock
                    </button>
                  )}
                </div>
              </div>

              {hasSavedMock && savedMockInfo ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-zinc-200 p-4">
                    <div className="text-xs text-zinc-500">Answered</div>
                    <div className="mt-1 text-xl font-bold text-zinc-900">
                      {savedMockInfo.answered}/{savedMockInfo.total}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 p-4">
                    <div className="text-xs text-zinc-500">Current</div>
                    <div className="mt-1 text-xl font-bold text-zinc-900">Q{savedMockInfo.currentIndex + 1}</div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 p-4">
                    <div className="text-xs text-zinc-500">Subject</div>
                    <div className="mt-1 text-xl font-bold text-zinc-900">{savedMockInfo.currentSubject}</div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 p-4">
                    <div className="text-xs text-zinc-500">Time left</div>
                    <div
                      className={`mt-1 text-xl font-bold ${
                        savedMockInfo.timeLeft <= 300 ? "text-red-600" : "text-zinc-900"
                      }`}
                    >
                      {fmtTime(savedMockInfo.timeLeft)}
                    </div>
                  </div>

                  {savedMockInfo.submitted && (
                    <div className="sm:col-span-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      This saved mock is already submitted. Start a new mock to practice again.
                    </div>
                  )}

                  {!savedMockInfo.submitted && savedMockInfo.timeLeft <= 0 && (
                    <div className="sm:col-span-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Time is up for this saved mock. Start a new mock.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Recent activity */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-zinc-900">Recent Activity</div>
                  <div className="text-sm text-zinc-600">Your latest attempts (last 8).</div>
                </div>

                <a className="text-sm font-semibold text-zinc-900 underline" href="/progress">
                  See all
                </a>
              </div>

              {recentAttempts.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                  No attempts yet. Start practicing and your activity will appear here.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-zinc-500">
                      <tr>
                        <th className="py-2">Time</th>
                        <th className="py-2">Question ID</th>
                        <th className="py-2">Picked</th>
                        <th className="py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAttempts.map((a) => (
                        <tr key={a.id} className="border-t">
                          <td className="py-3 text-zinc-600">{new Date(a.created_at).toLocaleString()}</td>
                          <td className="py-3 font-medium text-zinc-900">{a.question_id}</td>
                          <td className="py-3 text-zinc-700">{a.selected_option}</td>
                          <td className="py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                a.is_correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
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
          </section>
        </div>
      </div>
    </main>
  );
}
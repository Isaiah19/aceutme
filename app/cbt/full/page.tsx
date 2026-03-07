"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Question = {
  id: number;
  subject_id: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
};

type SubjectRow = { id: number; name: string };

const EXAM_DURATION_SECONDS = 2 * 60 * 60;
const STORAGE_KEY = "jamb_full_cbt_state_v5";
const ACTIVE_TAB_KEY = "jamb_full_cbt_active_tab_v1";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function safeEval(expr: string) {
  const cleaned = expr.replace(/\s+/g, "");
  if (!cleaned) return "";

  if (!/^[0-9+\-*/().%]+$/.test(cleaned)) {
    throw new Error("Invalid expression");
  }

  if (/[+\-*/%]{2,}/.test(cleaned.replace(/\(-/g, "("))) {
    throw new Error("Invalid operator sequence");
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${cleaned});`);
  const val = fn();
  if (typeof val !== "number" || Number.isNaN(val) || !Number.isFinite(val)) {
    throw new Error("Math error");
  }
  return String(val);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function FullCbtPage() {
  const router = useRouter();
  const tabIdRef = useRef<string>(`tab_${Math.random().toString(36).slice(2)}`);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [subjects, setSubjects] = useState<{
    english: SubjectRow;
    maths: SubjectRow;
    physics: SubjectRow;
    chemistry: SubjectRow;
  } | null>(null);

  const [subjectNameById, setSubjectNameById] = useState<Record<number, string>>({});
  const [questions, setQuestions] = useState<Question[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});

  const [endTimeMs, setEndTimeMs] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);

  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<null | {
    totalCorrect: number;
    totalWrong: number;
    totalUnanswered: number;
    total: number;
    bySubject: Record<string, { correct: number; wrong: number; unanswered: number; total: number }>;
  }>(null);

  const [view, setView] = useState<"exam" | "review">("exam");
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [calcOpen, setCalcOpen] = useState(false);
  const [calcExpr, setCalcExpr] = useState("");
  const [calcError, setCalcError] = useState<string | null>(null);

  const [calcPos, setCalcPos] = useState<{ x: number; y: number }>({ x: 24, y: 110 });
  const [dragging, setDragging] = useState(false);
  const [dragOff, setDragOff] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [visibilityWarnings, setVisibilityWarnings] = useState(0);
  const [tabConflict, setTabConflict] = useState(false);

  const q = questions[currentIndex];

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const flaggedCount = useMemo(() => Object.values(flagged).filter(Boolean).length, [flagged]);
  const unansweredCount = useMemo(
    () => Math.max(0, questions.length - answeredCount),
    [questions.length, answeredCount]
  );

  const subjectIdsInOrder = useMemo(() => {
    if (!subjects) return [];
    return [subjects.english.id, subjects.maths.id, subjects.physics.id, subjects.chemistry.id];
  }, [subjects]);

  const currentSubjectId = q?.subject_id ?? null;
  const currentSubjectName = currentSubjectId ? subjectNameById[currentSubjectId] ?? "" : "";

  const calculatorAllowed = useMemo(() => {
    const name = (currentSubjectName || "").toLowerCase().trim();
    if (!name) return false;
    return name !== "english";
  }, [currentSubjectName]);

  function saveState(userId: string) {
    if (!endTimeMs) return;
    const payload = {
      userId,
      endTimeMs,
      currentIndex,
      answers,
      flagged,
      questionIds: questions.map((x) => x.id),
      subjectNameById,
      subjects,
      submitted,
      result,
      view,
      calcExpr,
      calcPos,
      msg,
      visibilityWarnings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function loadSubjects() {
    const { data, error } = await supabase.from("subjects").select("id,name");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SubjectRow[];

    const pick = (name: string) =>
      rows.find((r) => r.name.trim().toLowerCase() === name.toLowerCase());

    const english = pick("English");
    const maths = pick("Mathematics");
    const physics = pick("Physics");
    const chemistry = pick("Chemistry");

    if (!english || !maths || !physics || !chemistry) {
      throw new Error(
        "Subjects not found. Ensure subjects table contains: English, Mathematics, Physics, Chemistry."
      );
    }

    const map: Record<number, string> = {};
    rows.forEach((r) => (map[r.id] = r.name));

    setSubjectNameById(map);
    setSubjects({ english, maths, physics, chemistry });

    return { english, maths, physics, chemistry, map };
  }

  async function fetchSubjectQuestions(subjectId: number, needed: number) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("subject_id", subjectId)
      .order("id", { ascending: false })
      .limit(3000);

    if (error) throw new Error(error.message);

    const pool = (data ?? []) as Question[];
    if (pool.length < needed) {
      throw new Error(
        `Not enough questions for subject_id=${subjectId}. Needed ${needed}, found ${pool.length}. Upload more questions.`
      );
    }

    return shuffle(pool).slice(0, needed);
  }

  async function startNewExam(userId: string) {
    setMsg(null);
    setSubmitted(false);
    setResult(null);
    setView("exam");

    setCalcExpr("");
    setCalcError(null);
    setCalcOpen(false);
    setCalcPos({ x: 24, y: 110 });

    const { english, maths, physics, chemistry, map } = await loadSubjects();

    const engQ = await fetchSubjectQuestions(english.id, 60);
    const mathQ = await fetchSubjectQuestions(maths.id, 40);
    const phyQ = await fetchSubjectQuestions(physics.id, 40);
    const chemQ = await fetchSubjectQuestions(chemistry.id, 40);

    const all = [...engQ, ...mathQ, ...phyQ, ...chemQ];

    setQuestions(all);
    setAnswers({});
    setFlagged({});
    setCurrentIndex(0);
    setVisibilityWarnings(0);

    const newEnd = Date.now() + EXAM_DURATION_SECONDS * 1000;
    setEndTimeMs(newEnd);
    setTimeLeft(EXAM_DURATION_SECONDS);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId,
        endTimeMs: newEnd,
        currentIndex: 0,
        answers: {},
        flagged: {},
        questionIds: all.map((x) => x.id),
        subjectNameById: map,
        subjects: { english, maths, physics, chemistry },
        submitted: false,
        result: null,
        view: "exam",
        calcExpr: "",
        calcPos: { x: 24, y: 110 },
        msg: null,
        visibilityWarnings: 0,
      })
    );
  }

  async function restoreOrStart() {
    setLoading(true);
    setMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      router.push("/login?next=/cbt/full");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_premium,premium_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      setMsg(profileError.message);
      setLoading(false);
      return;
    }

    const premiumUntilMs = profile?.premium_until
      ? new Date(profile.premium_until).getTime()
      : null;

    const stillPremium =
      !!profile?.is_premium && (!premiumUntilMs || premiumUntilMs > Date.now());

    if (!stillPremium) {
      clearState();
      router.push("/checkout");
      return;
    }

    setAuthChecked(true);

    const savedRaw = localStorage.getItem(STORAGE_KEY);

    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw);

        if (saved.userId !== user.id) {
          clearState();
          await startNewExam(user.id);
          setLoading(false);
          return;
        }

        if (typeof saved.endTimeMs === "number") {
          setEndTimeMs(saved.endTimeMs);
          const left = Math.max(0, Math.floor((saved.endTimeMs - Date.now()) / 1000));
          setTimeLeft(left);
        }

        setCurrentIndex(typeof saved.currentIndex === "number" ? saved.currentIndex : 0);
        setAnswers(saved.answers ?? {});
        setFlagged(saved.flagged ?? {});
        setSubjectNameById(saved.subjectNameById ?? {});
        setSubjects(saved.subjects ?? null);
        setSubmitted(!!saved.submitted);
        setResult(saved.result ?? null);
        setView(saved.view === "review" ? "review" : "exam");
        setCalcExpr(typeof saved.calcExpr === "string" ? saved.calcExpr : "");
        setVisibilityWarnings(
          typeof saved.visibilityWarnings === "number" ? saved.visibilityWarnings : 0
        );
        if (saved.calcPos?.x != null && saved.calcPos?.y != null) setCalcPos(saved.calcPos);
        setMsg(typeof saved.msg === "string" ? saved.msg : null);

        if (saved.submitted && saved.result) {
          router.replace("/cbt/submitted");
          setLoading(false);
          return;
        }

        const ids: number[] = Array.isArray(saved.questionIds) ? saved.questionIds : [];
        if (ids.length === 180) {
          const { data, error } = await supabase.from("questions").select("*").in("id", ids);
          if (error) throw new Error(error.message);

          const all = (data ?? []) as Question[];
          const byId = new Map(all.map((x) => [x.id, x]));
          const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
          setQuestions(ordered);

          setLoading(false);
          return;
        }

        clearState();
      } catch {
        clearState();
      }
    }

    await startNewExam(user.id);
    setLoading(false);
  }

  useEffect(() => {
    restoreOrStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    localStorage.setItem(ACTIVE_TAB_KEY, tabIdRef.current);

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_TAB_KEY && e.newValue && e.newValue !== tabIdRef.current) {
        setTabConflict(true);
        setMsg("⚠️ This exam is open in another tab. Please continue in only one tab.");
      }
    };

    const onFocus = () => {
      localStorage.setItem(ACTIVE_TAB_KEY, tabIdRef.current);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked || submitted) return;

    const onVisibility = () => {
      if (document.hidden) {
        setVisibilityWarnings((prev) => {
          const next = prev + 1;
          if (next <= 3) {
            setMsg(`⚠️ Tab switch detected (${next}/3). Stay on the exam page.`);
          }
          return next;
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [authChecked, submitted]);

  useEffect(() => {
    if (visibilityWarnings >= 3 && !submitted && questions.length > 0) {
      handleSubmit(true);
      setMsg("⚠️ Exam submitted automatically because of repeated tab switching.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibilityWarnings]);

  useEffect(() => {
    if (!endTimeMs || submitted) return;

    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        handleSubmit(true);
      }
    }, 1000);

    return () => clearInterval(t);
  }, [endTimeMs, submitted]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      if (!questions.length || endTimeMs == null) return;
      saveState(data.user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    answers,
    flagged,
    currentIndex,
    endTimeMs,
    submitted,
    result,
    questions.length,
    view,
    calcExpr,
    calcPos,
    msg,
    visibilityWarnings,
  ]);

  useEffect(() => {
    if (!calcOpen) return;

    const move = (e: PointerEvent) => {
      if (!dragging) return;

      const pad = 8;
      const w = 360;
      const h = 520;

      const nextX = clamp(e.clientX - dragOff.x, pad, window.innerWidth - w - pad);
      const nextY = clamp(e.clientY - dragOff.y, pad, window.innerHeight - h - pad);

      setCalcPos({ x: nextX, y: nextY });
    };

    const up = () => setDragging(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [calcOpen, dragging, dragOff]);

  function selectAnswer(opt: "A" | "B" | "C" | "D") {
    if (!q || submitted || tabConflict) return;
    setAnswers((prev) => ({ ...prev, [q.id]: opt }));
  }

  function toggleFlag() {
    if (!q || submitted || tabConflict) return;
    setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }));
  }

  function goTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
    setView("exam");
  }

  function goToSubjectFirstQuestion(subjectId: number) {
    const idx = questions.findIndex((x) => x.subject_id === subjectId);
    if (idx >= 0) {
      setCurrentIndex(idx);
      setView("exam");
    }
  }

  function computeResult() {
    const bySubject: Record<
      string,
      { correct: number; wrong: number; unanswered: number; total: number }
    > = {};

    let totalCorrect = 0;
    let totalWrong = 0;
    let totalUnanswered = 0;

    questions.forEach((qq) => {
      const sname = subjectNameById[qq.subject_id] ?? `Subject ${qq.subject_id}`;
      if (!bySubject[sname]) bySubject[sname] = { correct: 0, wrong: 0, unanswered: 0, total: 0 };

      bySubject[sname].total += 1;

      const picked = answers[qq.id];

      if (!picked) {
        bySubject[sname].unanswered += 1;
        totalUnanswered += 1;
        return;
      }

      if (picked === qq.correct_option) {
        bySubject[sname].correct += 1;
        totalCorrect += 1;
      } else {
        bySubject[sname].wrong += 1;
        totalWrong += 1;
      }
    });

    return { totalCorrect, totalWrong, totalUnanswered, total: questions.length, bySubject };
  }

  function handleSubmit(fromAuto = false) {
    if (submitted) return;

    const r = computeResult();

    setSubmitted(true);
    setResult(r);
    setShowSubmitModal(false);
    setView("exam");

    if (fromAuto && !msg) {
      setMsg("⏰ Time up! Exam submitted automatically.");
    }

    router.push("/cbt/submitted");
  }

  function restartExam() {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return router.push("/login?next=/cbt/full");
      clearState();
      await startNewExam(user.id);
    })();
  }

  function openSubmitModal() {
    if (submitted || tabConflict) return;
    setShowSubmitModal(true);
  }

  function calcPress(v: string) {
    setCalcError(null);
    setCalcExpr((prev) => prev + v);
  }

  function calcClear() {
    setCalcError(null);
    setCalcExpr("");
  }

  function calcBackspace() {
    setCalcError(null);
    setCalcExpr((prev) => prev.slice(0, -1));
  }

  function calcEquals() {
    try {
      const out = safeEval(calcExpr);
      setCalcExpr(out);
      setCalcError(null);
    } catch (e: any) {
      setCalcError(e?.message ?? "Error");
    }
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
    setDragOff({
      x: e.clientX - calcPos.x,
      y: e.clientY - calcPos.y,
    });
  }

  const badge = (label: string, className: string) => (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${className}`}>{label}</span>
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-6xl text-zinc-700">Loading full CBT...</div>
      </main>
    );
  }

  if (msg && !questions.length) {
    return (
      <main className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {msg}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f4f7]">
      <div className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Full UTME Mock (CBT)</div>
            <div className="text-xs text-zinc-600">
              Answered: {answeredCount}/{questions.length} • Unanswered: {unansweredCount} • Flagged:{" "}
              {flaggedCount}
              {currentSubjectId ? (
                <>
                  {" "}
                  • Subject:{" "}
                  <span className="font-semibold">{subjectNameById[currentSubjectId] ?? "—"}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-lg border bg-white px-3 py-2">
              <div className="text-[11px] text-zinc-500">Time Left</div>
              <div className={`text-lg font-bold ${timeLeft <= 300 ? "text-red-600" : "text-zinc-900"}`}>
                {fmtTime(timeLeft)}
              </div>
            </div>

            <button
              onClick={() => calculatorAllowed && setCalcOpen(true)}
              disabled={!calculatorAllowed}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                calculatorAllowed
                  ? "border border-zinc-300 bg-white hover:bg-zinc-50"
                  : "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400"
              }`}
              title={calculatorAllowed ? "Open Calculator" : "Calculator not available for English"}
            >
              Calculator
            </button>

            {!submitted ? (
              <>
                <button
                  onClick={() => setView("review")}
                  disabled={tabConflict}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Review
                </button>
                <button
                  onClick={openSubmitModal}
                  disabled={tabConflict}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Submit
                </button>
              </>
            ) : (
              <button
                onClick={restartExam}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                Start new exam
              </button>
            )}

            <a
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
              href="/dashboard"
            >
              Dashboard
            </a>
          </div>
        </div>

        {subjects && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {subjectIdsInOrder.map((sid) => {
                const active = sid === currentSubjectId;
                return (
                  <button
                    key={sid}
                    onClick={() => goToSubjectFirstQuestion(sid)}
                    className={`rounded-md px-3 py-2 text-sm font-semibold ${
                      active ? "bg-black text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                    }`}
                  >
                    {subjectNameById[sid] ?? `Subject ${sid}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(msg || tabConflict || visibilityWarnings > 0) && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Exam notice</div>
            {msg ? <div className="mt-1">{msg}</div> : null}
            <div className="mt-1">Tab switch warnings: {visibilityWarnings}/3</div>
            {tabConflict ? (
              <div className="mt-1">Another tab is using this exam session.</div>
            ) : null}
          </div>
        </div>
      )}

      {calcOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCalcOpen(false)} />
          <div className="fixed z-50 select-none" style={{ left: calcPos.x, top: calcPos.y }}>
            <div className="w-[360px] rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
              <div
                onPointerDown={startDrag}
                className={`flex cursor-move items-center justify-between rounded-t-xl border-b px-4 py-3 ${
                  dragging ? "bg-zinc-100" : "bg-white"
                }`}
              >
                <div className="text-sm font-bold text-zinc-900">Calculator</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalcOpen(false);
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-semibold hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>

              <div className="px-4 py-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="break-words text-right text-lg font-bold text-zinc-900">
                    {calcExpr || "0"}
                  </div>
                  {calcError && <div className="mt-1 text-right text-xs text-red-600">{calcError}</div>}
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[
                    ["C", "C"],
                    ["⌫", "BS"],
                    ["(", "("],
                    [")", ")"],
                    ["7", "7"],
                    ["8", "8"],
                    ["9", "9"],
                    ["÷", "/"],
                    ["4", "4"],
                    ["5", "5"],
                    ["6", "6"],
                    ["×", "*"],
                    ["1", "1"],
                    ["2", "2"],
                    ["3", "3"],
                    ["-", "-"],
                    ["0", "0"],
                    [".", "."],
                    ["%", "%"],
                    ["+", "+"],
                  ].map(([label, val]) => (
                    <button
                      key={label}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (val === "C") return calcClear();
                        if (val === "BS") return calcBackspace();
                        calcPress(val);
                      }}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm font-bold hover:bg-zinc-50"
                    >
                      {label}
                    </button>
                  ))}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      calcEquals();
                    }}
                    className="col-span-4 rounded-lg bg-black px-3 py-3 text-sm font-bold text-white"
                  >
                    =
                  </button>
                </div>

                <div className="mt-3 text-xs text-zinc-500">
                  Drag the top bar to move. Allowed: numbers, + − × ÷, brackets, %, decimals.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showSubmitModal && !submitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
            <div className="border-b px-5 py-4">
              <div className="text-lg font-bold text-zinc-900">Submit Exam?</div>
              <div className="mt-1 text-sm text-zinc-600">Confirm submission. You can’t continue after submitting.</div>
            </div>

            <div className="px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Answered</div>
                  <div className="text-lg font-bold text-zinc-900">{answeredCount}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Unanswered</div>
                  <div className="text-lg font-bold text-zinc-900">{unansweredCount}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Flagged</div>
                  <div className="text-lg font-bold text-zinc-900">{flaggedCount}</div>
                </div>
              </div>

              {unansweredCount > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  You still have <b>{unansweredCount}</b> unanswered question(s). You may want to review before
                  submitting.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSubmitModal(false);
                  setView("review");
                }}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                Review
              </button>
              <button
                onClick={() => handleSubmit(false)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {!submitted && view === "review" && (
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="rounded-xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <div className="text-lg font-bold text-zinc-900">Review Answers</div>
                <div className="text-sm text-zinc-600">Click any question number to jump back and edit.</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setView("exam")}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
                >
                  Back to Exam
                </button>
                <button
                  onClick={openSubmitModal}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Submit
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {badge("Current", "bg-black text-white")}
                {badge("Answered", "bg-green-100 text-green-800")}
                {badge("Flagged", "bg-amber-100 text-amber-800")}
                {badge("Unanswered", "bg-white text-zinc-700 border border-zinc-200")}
              </div>

              <div className="space-y-5">
                {subjectIdsInOrder.map((sid) => {
                  const name = subjectNameById[sid] ?? `Subject ${sid}`;
                  const idxs = questions
                    .map((qq, idx) => ({ qq, idx }))
                    .filter((x) => x.qq.subject_id === sid);

                  return (
                    <div key={sid} className="rounded-lg border border-zinc-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-zinc-900">{name}</div>
                        <div className="text-xs text-zinc-600">
                          {idxs.filter((x) => answers[x.qq.id]).length}/{idxs.length} answered
                        </div>
                      </div>

                      <div className="grid grid-cols-10 gap-2">
                        {idxs.map(({ qq, idx }) => {
                          const isCurrent = idx === currentIndex;
                          const isAnswered = !!answers[qq.id];
                          const isFlagged = !!flagged[qq.id];

                          let cls = "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
                          if (isAnswered) cls = "border border-green-300 bg-green-100 text-green-900";
                          if (isFlagged) cls = "border border-amber-300 bg-amber-100 text-amber-900";
                          if (isCurrent) cls = "border border-black bg-black text-white";

                          return (
                            <button
                              key={qq.id}
                              onClick={() => goTo(idx)}
                              className={`h-9 rounded-md text-xs font-bold ${cls}`}
                              title={isAnswered ? `Answered: ${answers[qq.id]}` : "Unanswered"}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-lg bg-[#f8fafc] p-3 text-xs text-zinc-700">
                <div className="font-semibold">Summary</div>
                <div className="mt-1">Answered: {answeredCount}</div>
                <div>Unanswered: {unansweredCount}</div>
                <div>Flagged: {flaggedCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!submitted && view === "exam" && q && (
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
          <div className="rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm text-zinc-700">
                Question <span className="font-bold text-zinc-900">{currentIndex + 1}</span> /{" "}
                {questions.length}
              </div>

              <div className="flex items-center gap-2">
                {flagged[q.id]
                  ? badge("FLAGGED", "bg-amber-100 text-amber-800")
                  : badge("NOT FLAGGED", "bg-zinc-100 text-zinc-700")}

                <button
                  onClick={toggleFlag}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                >
                  {flagged[q.id] ? "Unflag" : "Flag"}
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="mb-4 rounded-lg bg-[#f8fafc] p-3 text-sm text-zinc-700">
                <span className="font-semibold">Instruction:</span> Choose the correct option.
              </div>

              <div className="text-base font-semibold text-zinc-900">{q.question}</div>

              <div className="mt-4 space-y-2">
                {(
                  [
                    ["A", q.option_a],
                    ["B", q.option_b],
                    ["C", q.option_c],
                    ["D", q.option_d],
                  ] as const
                ).map(([k, text]) => {
                  const checked = answers[q.id] === k;
                  return (
                    <label
                      key={k}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                        checked ? "border-black bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="opt"
                        className="mt-1"
                        checked={checked}
                        onChange={() => selectAnswer(k)}
                      />
                      <div>
                        <div className="text-sm font-bold text-zinc-900">{k}.</div>
                        <div className="text-sm text-zinc-800">{text}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => goTo(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Previous
                  </button>

                  <button
                    onClick={() => goTo(currentIndex + 1)}
                    disabled={currentIndex === questions.length - 1}
                    className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>

                <button
                  onClick={() => setView("review")}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
                >
                  Review
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-bold text-zinc-900">Question Palette</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {badge("Current", "bg-black text-white")}
                {badge("Answered", "bg-green-100 text-green-800")}
                {badge("Flagged", "bg-amber-100 text-amber-800")}
                {badge("Unanswered", "bg-white text-zinc-700 border border-zinc-200")}
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-10 gap-2">
                {questions.map((qq, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAnswered = !!answers[qq.id];
                  const isFlagged = !!flagged[qq.id];

                  let cls = "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
                  if (isAnswered) cls = "border border-green-300 bg-green-100 text-green-900";
                  if (isFlagged) cls = "border border-amber-300 bg-amber-100 text-amber-900";
                  if (isCurrent) cls = "border border-black bg-black text-white";

                  return (
                    <button
                      key={qq.id}
                      onClick={() => goTo(idx)}
                      className={`h-9 rounded-md text-xs font-bold ${cls}`}
                      title={subjectNameById[qq.subject_id] ?? ""}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg bg-[#f8fafc] p-3 text-xs text-zinc-700">
                <div className="font-semibold">Status</div>
                <div className="mt-1">Answered: {answeredCount}</div>
                <div>Unanswered: {unansweredCount}</div>
                <div>Flagged: {flaggedCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {submitted && <div className="mx-auto max-w-6xl px-4 py-8 text-zinc-700">Redirecting…</div>}
    </main>
  );
}
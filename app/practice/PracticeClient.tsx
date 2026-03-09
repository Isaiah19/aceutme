"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

type Question = {
  id: number;
  subject_id: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
  topic?: string | null;
  difficulty?: string | null;
  exam_year?: number | null;
};

const FREE_DAILY_LIMIT = 15;
const RANDOM_SESSION_SIZE = 20;

function isValidId(n: number) {
  return Number.isFinite(n) && n > 0;
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isPremiumActive(profile: { is_premium?: boolean | null; premium_until?: string | null } | null) {
  if (!profile?.is_premium) return false;
  if (!profile?.premium_until) return true;
  return new Date(profile.premium_until).getTime() > Date.now();
}

function normalizeMode(mode: string | null) {
  if (mode === "year" || mode === "topic") return mode;
  return "random";
}

function shuffleArray<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function PracticeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const subjectIdParam = searchParams.get("subjectId");
  const subjectId = subjectIdParam ? Number(subjectIdParam) : NaN;

  const modeParam = normalizeMode(searchParams.get("mode"));
  const yearParam = searchParams.get("year");
  const topicParam = searchParams.get("topic");

  const selectedYear = yearParam ? Number(yearParam) : NaN;
  const selectedTopic = topicParam?.trim() ?? "";

  const [subjectName, setSubjectName] = useState<string>("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [remainingFreeToday, setRemainingFreeToday] = useState<number>(FREE_DAILY_LIMIT);

  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | "">("");
  const [result, setResult] = useState<null | { correct: boolean; correctOption: string }>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const [questionIds, setQuestionIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const options = useMemo(() => {
    return question
      ? ([
          ["A", question.option_a],
          ["B", question.option_b],
          ["C", question.option_c],
          ["D", question.option_d],
        ] as const)
      : [];
  }, [question]);

  const totalQuestions = questionIds.length;

  const modeLabel = useMemo(() => {
    if (modeParam === "year" && Number.isFinite(selectedYear)) {
      return `${selectedYear} Past Questions`;
    }
    if (modeParam === "topic" && selectedTopic) {
      return `${selectedTopic} Practice`;
    }
    return "Random Practice";
  }, [modeParam, selectedYear, selectedTopic]);

  const title = subjectName ? `Practice: ${subjectName} — ${modeLabel}` : "Practice";

  const progressLabel = useMemo(() => {
    if (totalQuestions <= 0) return null;

    const n = currentIndex + 1;

    if (modeParam === "year" && Number.isFinite(selectedYear)) {
      return `${selectedYear} Question ${n} of ${totalQuestions}`;
    }

    return `Question ${n} of ${totalQuestions}`;
  }, [currentIndex, totalQuestions, modeParam, selectedYear]);

  async function ensureLoggedIn() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push("/login?next=/practice/select");
      return null;
    }
    return data.user;
  }

  async function loadAccessState(userId: string) {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("plan,is_premium,premium_until")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) {
      setMsg(profileErr.message);
      return null;
    }

    const currentPlan = isPremiumActive(profile) || profile?.plan === "pro" ? "pro" : "free";
    setPlan(currentPlan);

    const { count, error: countErr } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfTodayIso());

    if (countErr) {
      setMsg(countErr.message);
      return null;
    }

    const usedToday = count ?? 0;
    setRemainingFreeToday(Math.max(0, FREE_DAILY_LIMIT - usedToday));

    return {
      plan: currentPlan,
      usedToday,
    };
  }

  async function loadSubjectName() {
    if (!isValidId(subjectId)) {
      setSubjectName("");
      return null;
    }

    const { data, error } = await supabase
      .from("subjects")
      .select("id,name")
      .eq("id", subjectId)
      .single();

    if (error || !data) {
      setSubjectName("");
      return null;
    }

    setSubjectName(data.name);
    return data;
  }

  function applyQuestionFilters(query: any) {
    let next = query.eq("subject_id", subjectId);

    if (modeParam === "year") {
      if (!Number.isFinite(selectedYear)) return null;
      next = next.eq("exam_year", selectedYear);
    }

    if (modeParam === "topic") {
      if (!selectedTopic) return null;
      next = next.eq("topic", selectedTopic);
    }

    return next;
  }

  function buildQuestionsQuery(selectClause: string) {
    const base = supabase.from("questions").select(selectClause);
    return applyQuestionFilters(base);
  }

  async function buildQuestionSession() {
    if (!isValidId(subjectId)) {
      router.replace("/practice/select");
      return false;
    }

    const idQuery = buildQuestionsQuery("id");

    if (!idQuery) {
      setMsg("Invalid practice mode. Please go back and choose a valid option.");
      setLoading(false);
      return false;
    }

    const { data, error } = await idQuery;

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return false;
    }

    const ids = ((data ?? []) as { id: number }[]).map((x) => x.id);

    if (ids.length <= 0) {
      if (modeParam === "year") {
        setMsg(`No questions found for ${subjectName || "this subject"} in ${selectedYear}.`);
      } else if (modeParam === "topic") {
        setMsg(`No questions found for topic "${selectedTopic}" in ${subjectName || "this subject"}.`);
      } else {
        setMsg("No questions found for this subject yet. Please add questions in Supabase.");
      }
      setLoading(false);
      return false;
    }

    let sessionIds = shuffleArray(ids);

    if (modeParam === "random") {
      sessionIds = sessionIds.slice(0, Math.min(RANDOM_SESSION_SIZE, sessionIds.length));
    }

    setQuestionIds(sessionIds);
    setCurrentIndex(0);

    return true;
  }

  async function fetchQuestionById(questionId: number) {
    const { data, error } = await supabase
      .from("questions")
      .select(`
        id,
        subject_id,
        question,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        topic,
        difficulty,
        exam_year
      `)
      .eq("id", questionId)
      .single();

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    setQuestion(data as Question);
    setLoading(false);
  }

  async function loadQuestionByIndex(index: number) {
    if (index < 0 || index >= questionIds.length) {
      setMsg("No more questions in this session.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg(null);
    setResult(null);
    setSelected("");
    setExplanation(null);
    setQuestion(null);

    await fetchQuestionById(questionIds[index]);
  }

  async function initializePractice() {
    setLoading(true);
    setMsg(null);
    setResult(null);
    setSelected("");
    setExplanation(null);
    setQuestion(null);
    setQuestionIds([]);
    setCurrentIndex(0);

    const user = await ensureLoggedIn();
    if (!user) return;

    const access = await loadAccessState(user.id);
    if (!access) {
      setLoading(false);
      return;
    }

    const subject = await loadSubjectName();
    if (!subject) {
      setLoading(false);
      router.replace("/practice/select");
      return;
    }

    const isEnglish = subject.name.trim().toLowerCase() === "english";

    if (access.plan === "free" && !isEnglish) {
      setLoading(false);
      setMsg("This subject is available for Pro users only. Free users can practice English only.");
      return;
    }

    if (access.plan === "free" && access.usedToday >= FREE_DAILY_LIMIT) {
      setLoading(false);
      setMsg(
        `You have reached today's free practice limit of ${FREE_DAILY_LIMIT} questions. Upgrade to Pro for unlimited practice.`
      );
      return;
    }

    if (modeParam === "year" && !Number.isFinite(selectedYear)) {
      setLoading(false);
      setMsg("Missing or invalid year selection.");
      return;
    }

    if (modeParam === "topic" && !selectedTopic) {
      setLoading(false);
      setMsg("Missing or invalid topic selection.");
      return;
    }

    const ok = await buildQuestionSession();
    if (!ok) return;
  }

  async function submitAnswer() {
    if (!question || !selected) return;

    const user = await ensureLoggedIn();
    if (!user) return;

    const access = await loadAccessState(user.id);
    if (!access) return;

    if (access.plan === "free" && access.usedToday >= FREE_DAILY_LIMIT) {
      setMsg(
        `You have reached today's free practice limit of ${FREE_DAILY_LIMIT} questions. Upgrade to Pro for unlimited practice.`
      );
      return;
    }

    const isCorrect = selected === question.correct_option;
    setResult({ correct: isCorrect, correctOption: question.correct_option });
    setExplanation(null);

    const { error } = await supabase.from("attempts").insert({
      user_id: user.id,
      question_id: question.id,
      selected_option: selected,
      is_correct: isCorrect,
    });

    if (error) {
      setMsg("Saved result failed: " + error.message);
      return;
    }

    if (access.plan === "free") {
      const nextRemaining = Math.max(0, FREE_DAILY_LIMIT - (access.usedToday + 1));
      setRemainingFreeToday(nextRemaining);
    }
  }

  async function getExplanation() {
    if (!question) return;

    if (plan !== "pro") {
      setExplanation("AI explanation is available for Pro users only.");
      return;
    }

    setExplaining(true);
    setExplanation(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          questionId: question.id,
          subjectId: question.subject_id,
          question: question.question,
          correctOption: question.correct_option,
          options: {
            A: question.option_a,
            B: question.option_b,
            C: question.option_c,
            D: question.option_d,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      setExplaining(false);

      if (!res.ok) {
        setExplanation(data?.error ?? "Failed to get explanation.");
        return;
      }

      setExplanation(data.explanation);
    } catch (e: any) {
      setExplaining(false);
      setExplanation(e?.message ?? "Failed to get explanation.");
    }
  }

  async function goToNextQuestion() {
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questionIds.length) {
      setMsg("You have reached the end of this practice session.");
      return;
    }

    setCurrentIndex(nextIndex);
  }

  useEffect(() => {
    void initializePractice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectIdParam, modeParam, yearParam, topicParam]);

  useEffect(() => {
    if (questionIds.length > 0) {
      void loadQuestionByIndex(currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIds, currentIndex]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {modeParam === "year"
                ? `Practicing ${selectedYear} past questions`
                : modeParam === "topic"
                ? `Practicing topic: ${selectedTopic}`
                : `Practicing a ${Math.min(RANDOM_SESSION_SIZE, totalQuestions || RANDOM_SESSION_SIZE)}-question random session`}
            </p>
          </div>

          <div className="flex gap-3">
            <a className="text-sm text-zinc-600 underline" href="/practice/select">
              Change mode
            </a>
            <a className="text-sm text-zinc-600 underline" href="/dashboard">
              Back to Dashboard
            </a>
          </div>
        </div>

        {plan === "free" && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Free plan</div>
            <div className="mt-1">
              Free users can practice English only and have {FREE_DAILY_LIMIT} questions per day.
            </div>
            <div className="mt-1">
              Remaining today: <b>{remainingFreeToday}</b>
            </div>
            <a
              href="/checkout"
              className="mt-3 inline-block rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Upgrade to Pro
            </a>
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          {loading && <p>Loading question...</p>}
          {!loading && msg && <p className="text-red-600">{msg}</p>}

          {!loading && question && (
            <>
              {progressLabel && (
                <div className="mb-4 text-sm font-semibold text-zinc-600">
                  {progressLabel}
                </div>
              )}

              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {question.exam_year ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                    Year: {question.exam_year}
                  </span>
                ) : null}
                {question.topic ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                    Topic: {question.topic}
                  </span>
                ) : null}
                {question.difficulty ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                    Difficulty: {question.difficulty}
                  </span>
                ) : null}
              </div>

              <p className="text-lg font-medium text-zinc-900">{question.question}</p>

              <div className="mt-5 space-y-3">
                {options.map(([key, text]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                      selected === key ? "border-black" : "border-zinc-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="opt"
                      className="mt-1"
                      checked={selected === key}
                      onChange={() => setSelected(key)}
                      disabled={!!result}
                    />
                    <div>
                      <div className="font-semibold">{key}.</div>
                      <div className="text-zinc-700">{text}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {!result ? (
                  <button
                    onClick={submitAnswer}
                    disabled={!selected}
                    className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
                  >
                    Submit
                  </button>
                ) : (
                  <>
                    <div
                      className={`rounded-lg px-4 py-2 text-white ${
                        result.correct ? "bg-green-600" : "bg-red-600"
                      }`}
                    >
                      {result.correct ? "Correct ✅" : `Wrong ❌ (Answer: ${result.correctOption})`}
                    </div>

                    <button
                      onClick={goToNextQuestion}
                      className="rounded-lg border border-zinc-300 px-4 py-2"
                    >
                      {currentIndex + 1 >= totalQuestions ? "Finish session" : "Next question"}
                    </button>

                    <button
                      onClick={getExplanation}
                      disabled={explaining}
                      className="rounded-lg border border-zinc-300 px-4 py-2 disabled:opacity-60"
                    >
                      {explaining ? "Explaining..." : "Explain (AI)"}
                    </button>
                  </>
                )}
              </div>

              {explanation && (
                <div className="mt-4 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
                  {explanation}
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-sm text-zinc-500">
          Tip: You can open practice with:
          <span className="ml-1 font-mono">/practice?subjectId=1&amp;mode=random</span>
          <span className="mx-1">or</span>
          <span className="font-mono">/practice?subjectId=1&amp;mode=year&amp;year=2024</span>
          <span className="mx-1">or</span>
          <span className="font-mono">/practice?subjectId=1&amp;mode=topic&amp;topic=Synonyms</span>
        </p>
      </div>
    </main>
  );
}
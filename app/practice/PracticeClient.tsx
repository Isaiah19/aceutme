"use client";

import { useEffect, useState } from "react";
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
};

export default function PracticeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const subjectIdParam = searchParams.get("subjectId");
  const subjectId = subjectIdParam ? Number(subjectIdParam) : NaN;

  const [subjectName, setSubjectName] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | "">("");
  const [result, setResult] = useState<null | { correct: boolean; correctOption: string }>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  async function loadSubjectName() {
    if (!Number.isFinite(subjectId)) return;

    const { data, error } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .single();

    if (error || !data) {
      setSubjectName("");
      return;
    }

    setSubjectName(data.name);
  }

  async function loadQuestion() {
    setLoading(true);
    setMsg(null);
    setResult(null);
    setSelected("");
    setExplanation(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    if (!Number.isFinite(subjectId)) {
      setMsg("Missing subjectId in URL. Example: /practice?subjectId=1");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("subject_id", subjectId)
      .order("id", { ascending: false })
      .limit(50);

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setMsg("No questions found for this subject yet. Please add questions in Supabase.");
      setLoading(false);
      return;
    }

    const random = data[Math.floor(Math.random() * data.length)] as Question;
    setQuestion(random);
    setLoading(false);
  }

  async function submitAnswer() {
    if (!question || !selected) return;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      router.push("/login");
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
    }
  }

  async function getExplanation() {
    if (!question) return;

    setExplaining(true);
    setExplanation(null);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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

      const data = await res.json();
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

  useEffect(() => {
    (async () => {
      await loadSubjectName();
      await loadQuestion();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectIdParam]);

  const options = question
    ? ([
        ["A", question.option_a],
        ["B", question.option_b],
        ["C", question.option_c],
        ["D", question.option_d],
      ] as const)
    : [];

  const title = subjectName ? `Practice: ${subjectName}` : "Practice";

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
          <a className="text-sm text-zinc-600 underline" href="/dashboard">
            Back to Dashboard
          </a>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          {loading && <p>Loading question...</p>}
          {!loading && msg && <p className="text-red-600">{msg}</p>}

          {!loading && question && (
            <>
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
                      onClick={loadQuestion}
                      className="rounded-lg border border-zinc-300 px-4 py-2"
                    >
                      Next question
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
          Tip: Open practice with a subject id like{" "}
          <span className="font-mono">/practice?subjectId=1</span>
        </p>
      </div>
    </main>
  );
}

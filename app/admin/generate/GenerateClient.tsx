"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Subject = {
  id: number;
  name: string;
};

export default function GenerateClient() {
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [year, setYear] = useState("2015");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState("20");

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("subjects")
        .select("id,name")
        .order("name");

      if (error) {
        setMsg(error.message);
      } else {
        setSubjects((data ?? []) as Subject[]);
      }

      setLoading(false);
    })();
  }, [router]);

  async function generateQuestions() {
    setMsg(null);

    if (!subjectId) {
      setMsg("Choose a subject.");
      return;
    }

    if (!topic.trim()) {
      setMsg("Enter a topic.");
      return;
    }

    setGenerating(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setGenerating(false);
        setMsg("You are not logged in.");
        return;
      }

      const selectedSubject = subjects.find((s) => String(s.id) === subjectId);

      const res = await fetch("/api/admin/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject_id: Number(subjectId),
          subject: selectedSubject?.name ?? "",
          year: Number(year),
          topic: topic.trim(),
          difficulty,
          count: Number(count),
        }),
      });

      const data = await res.json().catch(() => ({}));
      setGenerating(false);

      if (!res.ok) {
        setMsg(data?.error ?? "Generation failed");
        return;
      }

      setMsg(data?.message ?? `Generated ${data?.inserted ?? 0} questions successfully.`);
    } catch (err: any) {
      setGenerating(false);
      setMsg(err?.message ?? "Generation failed");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Admin: AI Question Generator</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Generate original JAMB-style questions and save them directly to Supabase.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a className="text-sm text-zinc-600 underline" href="/admin/upload">
              CSV Upload
            </a>
            <a className="text-sm text-zinc-600 underline" href="/dashboard">
              Back to Dashboard
            </a>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-700">Subject</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">-- Choose subject --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700">Year</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    {Array.from({ length: 10 }, (_, i) => 2015 + i).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700">Topic</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Lexis and Structure"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700">Difficulty</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="easy">easy</option>
                    <option value="medium">medium</option>
                    <option value="hard">hard</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700">Number of Questions</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </div>
              </div>

              {msg && (
                <p className={`mt-4 text-sm ${msg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>
                  {msg}
                </p>
              )}

              <button
                onClick={generateQuestions}
                disabled={generating}
                className="mt-6 w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-60"
              >
                {generating ? "Generating..." : "Generate and Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

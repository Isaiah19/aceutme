"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../src/lib/supabaseClient";

type Subject = { id: number; name: string };

type CsvRow = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
};

type AdminTab = "upload" | "generate" | "verify";

type VerifyMismatch = {
  id: number;
  subject: string;
  exam_year: number | null;
  saved_correct_option: string;
  verified_correct_option: string;
  reason: string;
};

type VerifyResponse = {
  message?: string;
  checked?: number;
  passed?: number;
  failed?: number;
  dry_run?: boolean;
  mismatches?: VerifyMismatch[];
  error?: string;
  details?: string | null;
};

const VERIFY_YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => 2015 + i);

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
      continue;
    }
    if (ch === "\r") continue;

    current += ch;
  }

  if (current.trim().length > 0) lines.push(current);

  const splitRow = (row: string) => {
    const out: string[] = [];
    let cell = "";
    let q = false;

    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      const next = row[i + 1];

      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        q = !q;
        continue;
      }
      if (ch === "," && !q) {
        out.push(cell.trim());
        cell = "";
        continue;
      }
      cell += ch;
    }

    out.push(cell.trim());
    return out;
  };

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitRow(lines[0]).map((h) => h.trim());
  const rows = lines
    .slice(1)
    .filter((x) => x !== undefined && x !== null && String(x).trim().length > 0)
    .map((line) => {
      const cols = splitRow(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] ?? "";
      });
      return obj;
    });

  return { headers, rows };
}

function isValidCorrectOption(v: string) {
  return ["A", "B", "C", "D"].includes(String(v).toUpperCase());
}

function normalizeName(v: string) {
  return v.toLowerCase().replace(/[^a-z]/g, "");
}

function isEnglishSubject(name: string) {
  const n = normalizeName(name);
  return n === "english" || n === "englishlanguage";
}

export default function UploadClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/admin/upload";

  const [tab, setTab] = useState<AdminTab>("upload");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [fileName, setFileName] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<CsvRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  const [generateSubjectId, setGenerateSubjectId] = useState<number | "">("");
  const [generateYear, setGenerateYear] = useState<number>(2015);
  const [generateTopic, setGenerateTopic] = useState("");
  const [generateDifficulty, setGenerateDifficulty] = useState("medium");
  const [generateCount, setGenerateCount] = useState<number>(20);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const [verifyYears, setVerifyYears] = useState<number[]>([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]);
  const [verifyLimit, setVerifyLimit] = useState<number>(200);
  const [verifySubjects, setVerifySubjects] = useState<string[]>(["english", "mathematics"]);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  const requiredHeaders = [
    "question",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_option",
  ];

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);
      setWarning(null);
      setGenerateMsg(null);
      setVerifyMsg(null);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setMsg(profileError.message);
        setLoading(false);
        return;
      }

      if (!profile?.is_admin) {
        setMsg("You do not have permission to access the admin upload page.");
        setLoading(false);
        return;
      }

      setAuthorized(true);

      const { data, error } = await supabase
        .from("subjects")
        .select("id,name")
        .order("name");

      if (error) {
        setMsg(error.message);
      } else {
        const rows = (data ?? []) as Subject[];
        setSubjects(rows);

        const english = rows.find((s) => isEnglishSubject(s.name));
        if (english) {
          setGenerateSubjectId(english.id);
        }
      }

      setLoading(false);
    })();
  }, [router, nextUrl]);

  const canUpload = useMemo(() => {
    return (
      Number.isFinite(Number(subjectId)) &&
      !!csvFile &&
      preview.length > 0 &&
      !uploading &&
      authorized
    );
  }, [subjectId, csvFile, preview.length, uploading, authorized]);

  const canGenerate = useMemo(() => {
    return (
      authorized &&
      !generating &&
      Number.isFinite(Number(generateSubjectId)) &&
      !!generateTopic.trim() &&
      Number.isFinite(Number(generateYear)) &&
      Number.isFinite(Number(generateCount)) &&
      generateCount >= 1 &&
      generateCount <= 200
    );
  }, [
    authorized,
    generating,
    generateSubjectId,
    generateTopic,
    generateYear,
    generateCount,
  ]);

  const canVerify = useMemo(() => {
    return (
      authorized &&
      !verifying &&
      verifySubjects.length > 0 &&
      verifyYears.length > 0 &&
      Number.isFinite(Number(verifyLimit)) &&
      verifyLimit >= 1
    );
  }, [authorized, verifying, verifySubjects, verifyYears, verifyLimit]);

  const verifyYearSummary = useMemo(() => {
    if (verifyYears.length === 0) return "No years selected";
    const sorted = [...verifyYears].sort((a, b) => a - b);
    return sorted.join(", ");
  }, [verifyYears]);

  async function onPickFile(file: File | null) {
    setMsg(null);
    setWarning(null);
    setPreview([]);
    setFileName("");
    setCsvFile(null);

    if (!file) return;

    setCsvFile(file);
    setFileName(file.name);

    const text = await file.text();
    const parsed = parseCsv(text);

    const headersLower = parsed.headers.map((h) => h.toLowerCase());
    const ok = requiredHeaders.every((h) => headersLower.includes(h));

    if (!ok) {
      setMsg(`CSV header must include: ${requiredHeaders.join(", ")}.`);
      return;
    }

    const rows = parsed.rows.map((r) => {
      const get = (k: string) => r[k] ?? r[k.toUpperCase()] ?? r[k.toLowerCase()] ?? "";
      return {
        question: (get("question") || "").trim(),
        option_a: (get("option_a") || "").trim(),
        option_b: (get("option_b") || "").trim(),
        option_c: (get("option_c") || "").trim(),
        option_d: (get("option_d") || "").trim(),
        correct_option: (get("correct_option") || "").trim().toUpperCase(),
      };
    });

    setPreview(rows.slice(0, 10));

    const invalidCorrect = rows.some((r) => !isValidCorrectOption(r.correct_option));
    const missingText = rows.some(
      (r) => !r.question || !r.option_a || !r.option_b || !r.option_c || !r.option_d
    );

    if (invalidCorrect || missingText) {
      setWarning(
        "⚠️ Some rows are invalid (correct_option must be A/B/C/D and all fields must be filled). Invalid rows will be skipped by the importer."
      );
    }
  }

  async function upload() {
    setMsg(null);
    setWarning(null);

    const sid = Number(subjectId);
    if (!Number.isFinite(sid)) {
      setMsg("Choose a subject.");
      return;
    }

    if (!csvFile) {
      setMsg("Pick a CSV file first.");
      return;
    }

    setUploading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setUploading(false);
        setMsg("You are not logged in. Please login again.");
        router.push(`/login?next=${encodeURIComponent(nextUrl)}`);
        return;
      }

      const form = new FormData();
      form.append("file", csvFile);
      form.append("subjectId", String(sid));

      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setUploading(false);
        setMsg(data?.error ?? "Upload failed");
        return;
      }

      setUploading(false);
      setMsg(data?.message ?? "✅ Uploaded successfully.");
      setPreview([]);
      setCsvFile(null);
      setFileName("");
    } catch (e: any) {
      setUploading(false);
      setMsg(e?.message ?? "Upload failed");
    }
  }

  async function generateQuestions() {
    setGenerateMsg(null);

    const sid = Number(generateSubjectId);
    if (!Number.isFinite(sid)) {
      setGenerateMsg("Choose a subject.");
      return;
    }

    if (!generateTopic.trim()) {
      setGenerateMsg("Enter a topic.");
      return;
    }

    if (!generateYear || Number.isNaN(generateYear)) {
      setGenerateMsg("Choose a valid year.");
      return;
    }

    if (!generateCount || Number.isNaN(generateCount) || generateCount < 1 || generateCount > 200) {
      setGenerateMsg("Number of questions must be between 1 and 200.");
      return;
    }

    setGenerating(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setGenerating(false);
        setGenerateMsg("You are not logged in. Please login again.");
        router.push(`/login?next=${encodeURIComponent(nextUrl)}`);
        return;
      }

      const selectedSubject = subjects.find((s) => s.id === sid);

      const res = await fetch("/api/admin/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject_id: sid,
          subject: selectedSubject?.name ?? "",
          year: generateYear,
          topic: generateTopic.trim(),
          difficulty: generateDifficulty,
          count: generateCount,
          source: "AceUTME AI",
          is_past_question: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      setGenerating(false);

      if (!res.ok) {
        setGenerateMsg(data?.error ?? "Generation failed");
        return;
      }

      setGenerateMsg(
        data?.message ?? `✅ Generated and inserted ${data?.inserted ?? 0} questions successfully.`
      );
    } catch (e: any) {
      setGenerating(false);
      setGenerateMsg(e?.message ?? "Generation failed");
    }
  }

  async function runVerification(dryRun: boolean) {
    setVerifyMsg(null);
    setVerifyResult(null);

    if (!canVerify) {
      setVerifyMsg("Select at least one subject, at least one year, and a valid limit.");
      return;
    }

    setVerifying(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setVerifying(false);
        setVerifyMsg("You are not logged in. Please login again.");
        router.push(`/login?next=${encodeURIComponent(nextUrl)}`);
        return;
      }

      const subjectPayload = verifySubjects.flatMap((s) => {
        if (s === "english") return ["english", "english language"];
        if (s === "mathematics") return ["mathematics", "maths", "general mathematics"];
        return [s];
      });

      const res = await fetch("/api/admin/verify-saved-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          years: [...verifyYears].sort((a, b) => a - b),
          subjects: subjectPayload,
          limit: verifyLimit,
          dry_run: dryRun,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as VerifyResponse;
      setVerifying(false);

      if (!res.ok) {
        const details =
          typeof data?.details === "string" && data.details.trim()
            ? `: ${data.details}`
            : "";
        setVerifyMsg(`${data?.error ?? "Verification failed"}${details}`);
        return;
      }

      setVerifyResult(data);
      setVerifyMsg(
        data?.message ??
          (dryRun ? "Verification completed in dry-run mode." : "Verification completed.")
      );
    } catch (e: any) {
      setVerifying(false);
      setVerifyMsg(e?.message ?? "Verification failed");
    }
  }

  function toggleVerifySubject(subject: "english" | "mathematics") {
    setVerifySubjects((prev) =>
      prev.includes(subject) ? prev.filter((x) => x !== subject) : [...prev, subject]
    );
  }

  function toggleVerifyYear(year: number) {
    setVerifyYears((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year].sort((a, b) => a - b)
    );
  }

  function selectAllVerifyYears() {
    setVerifyYears([...VERIFY_YEAR_OPTIONS]);
  }

  function clearVerifyYears() {
    setVerifyYears([]);
  }

  async function logoutAdmin() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-5xl p-8">
          <div className="rounded-2xl bg-white p-6 shadow-sm">Loading admin tools...</div>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-5xl p-8">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-zinc-900">Admin Tools</h1>
            <p className="mt-4 text-red-600">
              {msg ?? "You are not authorized to view this page."}
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="/dashboard"
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Back to Dashboard
              </a>
              <a
                href={`/login?next=${encodeURIComponent(nextUrl)}`}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
              >
                Login
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Admin Tools</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Upload CSV files, generate original JAMB-style questions, or verify saved answer keys.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a className="text-sm text-zinc-600 underline" href="/dashboard">
              Back to Dashboard
            </a>
            <button
              onClick={logoutAdmin}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Signed in as admin.
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTab("upload")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                tab === "upload"
                  ? "bg-black text-white"
                  : "border border-zinc-300 bg-white text-zinc-900"
              }`}
            >
              CSV Upload
            </button>

            <button
              type="button"
              onClick={() => setTab("generate")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                tab === "generate"
                  ? "bg-black text-white"
                  : "border border-zinc-300 bg-white text-zinc-900"
              }`}
            >
              AI Generate
            </button>

            <button
              type="button"
              onClick={() => setTab("verify")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                tab === "verify"
                  ? "bg-black text-white"
                  : "border border-zinc-300 bg-white text-zinc-900"
              }`}
            >
              Verify Saved
            </button>
          </div>

          {tab === "upload" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-700">Select subject</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : "")}
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
                  <label className="text-sm font-medium text-zinc-700">CSV file</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    type="file"
                    accept=".csv"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  {fileName && <p className="mt-2 text-sm text-zinc-600">Loaded: {fileName}</p>}
                </div>
              </div>

              {preview.length > 0 && (
                <div className="mt-6 rounded-xl border border-zinc-200 p-4">
                  <div className="font-semibold">Preview (first 10 rows)</div>
                  <div className="mt-3 space-y-3">
                    {preview.map((r, idx) => (
                      <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                        <div className="font-medium">{r.question}</div>
                        <div className="mt-2 text-zinc-700">
                          A. {r.option_a} <br />
                          B. {r.option_b} <br />
                          C. {r.option_c} <br />
                          D. {r.option_d}
                        </div>
                        <div className="mt-2 text-sm">
                          Correct:{" "}
                          <b className={isValidCorrectOption(String(r.correct_option)) ? "" : "text-red-600"}>
                            {String(r.correct_option)}
                          </b>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {warning && <p className="mt-4 text-amber-700">{warning}</p>}

              {msg && (
                <p className={`mt-4 ${msg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>
                  {msg}
                </p>
              )}

              <button
                onClick={upload}
                disabled={!canUpload}
                className="mt-6 w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-60"
              >
                {uploading ? "Uploading..." : "Upload to Supabase"}
              </button>

              <p className="mt-4 text-sm text-zinc-600">
                Note: <b>correct_option</b> must be exactly <b>A</b>, <b>B</b>, <b>C</b>, or <b>D</b>. Any invalid rows
                are skipped by the importer.
              </p>
            </>
          ) : tab === "generate" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-700">Subject</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={generateSubjectId}
                    onChange={(e) =>
                      setGenerateSubjectId(e.target.value ? Number(e.target.value) : "")
                    }
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
                    value={generateYear}
                    onChange={(e) => setGenerateYear(Number(e.target.value))}
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
                    value={generateTopic}
                    onChange={(e) => setGenerateTopic(e.target.value)}
                    placeholder="e.g. Lexis and Structure"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700">Difficulty</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={generateDifficulty}
                    onChange={(e) => setGenerateDifficulty(e.target.value)}
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
                    value={generateCount}
                    onChange={(e) => setGenerateCount(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                This will generate original JAMB-style questions and insert them directly into the selected subject.
              </div>

              {generateMsg && (
                <p
                  className={`mt-4 ${
                    generateMsg.startsWith("✅") ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {generateMsg}
                </p>
              )}

              <button
                onClick={generateQuestions}
                disabled={!canGenerate}
                className="mt-6 w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-60"
              >
                {generating ? "Generating..." : "Generate and Save"}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Audit saved questions before users see answer-key mistakes. You can now select multiple years and verify them in one run.
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-700">Limit</label>
                  <input
                    type="number"
                    min="1"
                    className="mt-1 w-full rounded-xl border border-zinc-300 p-3"
                    value={verifyLimit}
                    onChange={(e) => setVerifyLimit(Number(e.target.value))}
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Higher limit checks more selected-year questions in one run.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700">Subjects</label>
                  <div className="mt-2 flex flex-wrap gap-3 rounded-xl border border-zinc-300 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={verifySubjects.includes("english")}
                        onChange={() => toggleVerifySubject("english")}
                      />
                      English
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={verifySubjects.includes("mathematics")}
                        onChange={() => toggleVerifySubject("mathematics")}
                      />
                      Mathematics
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-zinc-700">Years to Verify</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllVerifyYears}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearVerifyYears}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mt-2 rounded-xl border border-zinc-300 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {VERIFY_YEAR_OPTIONS.map((year) => (
                      <label key={year} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={verifyYears.includes(year)}
                          onChange={() => toggleVerifyYear(year)}
                        />
                        {year}
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 text-xs text-zinc-600">
                    Selected years: <b>{verifyYearSummary}</b>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                Recommended first run: <b>Maths only</b>, select <b>2015–2024</b>, set limit to <b>200</b> or more, then use <b>Dry Run</b>.
              </div>

              {verifyMsg && (
                <p
                  className={`mt-4 ${
                    verifyMsg.startsWith("Verification completed") || verifyMsg.startsWith("✅")
                      ? "text-green-700"
                      : "text-red-600"
                  }`}
                >
                  {verifyMsg}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => runVerification(true)}
                  disabled={!canVerify}
                  className="rounded-lg bg-black px-4 py-3 text-white disabled:opacity-60"
                >
                  {verifying ? "Running..." : "Dry Run Verification"}
                </button>

                <button
                  onClick={() => runVerification(false)}
                  disabled={!canVerify}
                  className="rounded-lg border border-red-300 bg-white px-4 py-3 text-red-700 disabled:opacity-60"
                >
                  {verifying ? "Running..." : "Auto Fix and Save"}
                </button>
              </div>

              {verifyResult && (
                <div className="mt-6 rounded-xl border border-zinc-200 p-4">
                  <div className="text-lg font-semibold text-zinc-900">Verification Result</div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-zinc-200 p-3">
                      <div className="text-xs text-zinc-500">Checked</div>
                      <div className="mt-1 text-xl font-bold text-zinc-900">
                        {verifyResult.checked ?? 0}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200 p-3">
                      <div className="text-xs text-zinc-500">Passed</div>
                      <div className="mt-1 text-xl font-bold text-green-700">
                        {verifyResult.passed ?? 0}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200 p-3">
                      <div className="text-xs text-zinc-500">Failed</div>
                      <div className="mt-1 text-xl font-bold text-red-700">
                        {verifyResult.failed ?? 0}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200 p-3">
                      <div className="text-xs text-zinc-500">Mode</div>
                      <div className="mt-1 text-xl font-bold text-zinc-900">
                        {verifyResult.dry_run ? "Dry Run" : "Auto Fix"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="font-semibold text-zinc-900">Mismatches</div>

                    {!verifyResult.mismatches || verifyResult.mismatches.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        No mismatches found in this run.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {verifyResult.mismatches.map((item) => (
                          <div key={`${item.id}-${item.subject}`} className="rounded-lg border border-zinc-200 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-semibold text-zinc-900">
                                ID #{item.id} • {item.subject} • {item.exam_year ?? "—"}
                              </div>
                              <div className="text-sm text-zinc-600">
                                Saved: <b>{item.saved_correct_option || "—"}</b> → Verified:{" "}
                                <b className="text-red-700">{item.verified_correct_option || "—"}</b>
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-zinc-700">{item.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
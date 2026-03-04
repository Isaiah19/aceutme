// app/admin/upload/UploadClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

type Subject = { id: number; name: string };

type CsvRow = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
};

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    // escaped quote inside a quoted string: ""
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
      headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
      return obj;
    });

  return { headers, rows };
}

function isValidCorrectOption(v: string) {
  return ["A", "B", "C", "D"].includes(v);
}

export default function UploadClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextUrl = searchParams.get("next") || "/admin/upload";

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [fileName, setFileName] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<CsvRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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

      // Basic auth: must be logged-in user (Supabase) to even access admin tools
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase.from("subjects").select("id,name").order("name");
      if (error) setMsg(error.message);
      else setSubjects((data ?? []) as Subject[]);

      setLoading(false);
    })();
  }, [router]);

  const canUpload = useMemo(() => {
    return Number.isFinite(Number(subjectId)) && !!csvFile && preview.length > 0 && !uploading;
  }, [subjectId, csvFile, preview.length, uploading]);

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
      // IMPORTANT: multipart/form-data (do NOT set Content-Type header)
      const form = new FormData();
      form.append("file", csvFile);
      form.append("subjectId", String(sid));

      const res = await fetch("/api/admin/import", {
        method: "POST",
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
    } catch (e: any) {
      setUploading(false);
      setMsg(e?.message ?? "Upload failed");
    }
  }

  async function logoutAdmin() {
    // This logs out the Supabase session (user login)
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Admin: CSV Upload</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Import questions into Supabase (server-side insert via Service Role).
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
          {loading && <p>Loading...</p>}

          {!loading && (
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
            </>
          )}
        </div>

        <p className="mx-auto mt-4 max-w-3xl text-sm text-zinc-600">
          Note: <b>correct_option</b> must be exactly <b>A</b>, <b>B</b>, <b>C</b>, or <b>D</b>. Any invalid rows are
          skipped by the importer.
        </p>

        {/* Hidden: in case you want to link back after login */}
        <a href={`/admin/login?next=${encodeURIComponent(nextUrl)}`} className="sr-only">
          Admin login
        </a>
      </div>
    </main>
  );
}

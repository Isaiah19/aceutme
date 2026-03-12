import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuestionRow = {
  id: number;
  subject_id: number;
  exam_year: number | null;
  topic: string | null;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string | null;
};

type VerificationResult = {
  status: "pass" | "fail";
  reason: string;
  correct_option: string;
  fixed_explanation: string;
};

function getBearerToken(req: Request) {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  }

  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(v: unknown) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function isValidCorrectOption(v: string) {
  return ["A", "B", "C", "D"].includes(String(v).trim().toUpperCase());
}

function hasDuplicateOptions(row: QuestionRow) {
  const values = [row.option_a, row.option_b, row.option_c, row.option_d].map(
    (v) => normalizeText(v).toLowerCase()
  );
  return new Set(values).size !== values.length;
}

function basicRowValidation(row: QuestionRow) {
  const okText =
    !!normalizeText(row.question) &&
    !!normalizeText(row.option_a) &&
    !!normalizeText(row.option_b) &&
    !!normalizeText(row.option_c) &&
    !!normalizeText(row.option_d);

  if (!okText) {
    return { valid: false, reason: "Missing required question or option text" };
  }

  if (!isValidCorrectOption(row.correct_option)) {
    return { valid: false, reason: "Invalid saved correct_option" };
  }

  if (hasDuplicateOptions(row)) {
    return { valid: false, reason: "Duplicate options detected" };
  }

  return { valid: true, reason: "" };
}

function subjectAliasSet(subjects: string[]) {
  const out = new Set<string>();

  for (const raw of subjects) {
    const s = normalizeName(raw);
    if (!s) continue;

    if (s === "english" || s === "englishlanguage") {
      out.add("english");
      out.add("englishlanguage");
      continue;
    }

    if (s === "mathematics" || s === "maths" || s === "generalmathematics") {
      out.add("mathematics");
      out.add("maths");
      out.add("generalmathematics");
      continue;
    }

    out.add(s);
  }

  return out;
}

async function verifyQuestion(
  openai: OpenAI,
  subjectName: string,
  row: QuestionRow
): Promise<VerificationResult> {
  const verifierPrompt = `
You are a strict ${subjectName} exam verifier.

Check this multiple-choice question carefully.

Requirements:
1. Determine the actually correct option.
2. Confirm whether the saved correct_option is correct.
3. Confirm whether the explanation agrees with the correct option.
4. Confirm there is exactly one best answer.
5. If the saved answer is wrong, provide the corrected option.
6. If the explanation is weak or inconsistent, rewrite it clearly.
7. If the question itself is ambiguous or defective, mark status as "fail".
8. Return ONLY valid JSON.

Question JSON:
${JSON.stringify(
  {
    question: row.question,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
    correct_option: row.correct_option,
    explanation: row.explanation,
  },
  null,
  2
)}

Return exactly this JSON shape:
{
  "status": "pass",
  "reason": "string",
  "correct_option": "A",
  "fixed_explanation": "string"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict exam-quality verifier. Return strict JSON only. Reject ambiguous or answer-key-mismatched items.",
      },
      {
        role: "user",
        content: verifierPrompt,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    throw new Error("OpenAI verifier returned empty content");
  }

  const parsed = JSON.parse(raw) as Partial<VerificationResult>;

  const result: VerificationResult = {
    status: parsed.status === "fail" ? "fail" : "pass",
    reason: normalizeText(parsed.reason),
    correct_option: String(parsed.correct_option ?? "")
      .replace(".", "")
      .trim()
      .toUpperCase(),
    fixed_explanation: normalizeText(parsed.fixed_explanation),
  };

  if (!isValidCorrectOption(result.correct_option)) {
    throw new Error("Verifier returned invalid correct_option");
  }

  if (!result.fixed_explanation) {
    throw new Error("Verifier returned empty fixed_explanation");
  }

  return result;
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const openai = getOpenAIClient();

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: missing Bearer token" },
        { status: 401 }
      );
    }

    const { data: authData, error: authErr } =
      await supabaseAdmin.auth.getUser(token);

    if (authErr || !authData?.user) {
      return NextResponse.json(
        { error: "Unauthorized: invalid token" },
        { status: 401 }
      );
    }

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json(
        { error: "Failed to verify admin access", details: profErr.message },
        { status: 500 }
      );
    }

    if (!prof?.is_admin) {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const yearFrom = Number(body?.year_from ?? 2015);
    const yearTo = Number(body?.year_to ?? 2024);
    const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 500);
    const offset = Math.max(Number(body?.offset ?? 0), 0);
    const dryRun = Boolean(body?.dry_run ?? true);

    const requestedSubjects = Array.isArray(body?.subjects)
      ? body.subjects.map((x: unknown) => String(x))
      : ["english", "english language", "mathematics", "maths"];

    if (
      !Number.isFinite(yearFrom) ||
      !Number.isFinite(yearTo) ||
      yearFrom > yearTo
    ) {
      return NextResponse.json(
        { error: "Invalid year range" },
        { status: 400 }
      );
    }

    const aliases = subjectAliasSet(requestedSubjects);

    const { data: subjectRows, error: subjectErr } = await supabaseAdmin
      .from("subjects")
      .select("id,name");

    if (subjectErr) {
      return NextResponse.json(
        { error: "Failed to load subjects", details: subjectErr.message },
        { status: 500 }
      );
    }

    const matchingSubjects = (subjectRows ?? []).filter((s) =>
      aliases.has(normalizeName(s.name))
    );

    if (!matchingSubjects.length) {
      return NextResponse.json(
        { error: "No matching subjects found" },
        { status: 400 }
      );
    }

    const subjectIdToName = new Map<number, string>(
      matchingSubjects.map((s) => [s.id, s.name])
    );

    const subjectIds = matchingSubjects.map((s) => s.id);
    const rangeTo = offset + limit - 1;

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("questions")
      .select(
        "id,subject_id,exam_year,topic,question,option_a,option_b,option_c,option_d,correct_option,explanation"
      )
      .in("subject_id", subjectIds)
      .gte("exam_year", yearFrom)
      .lte("exam_year", yearTo)
      .order("id", { ascending: true })
      .range(offset, rangeTo);

    if (rowsErr) {
      return NextResponse.json(
        { error: "Failed to load questions", details: rowsErr.message },
        { status: 500 }
      );
    }

    const questions = (rows ?? []) as QuestionRow[];

    if (!questions.length) {
      return NextResponse.json({
        message: "No matching questions found",
        checked: 0,
        passed: 0,
        corrected: 0,
        failed: 0,
        mismatches: [],
        dry_run: dryRun,
        offset,
        limit,
      });
    }

    const mismatches: Array<{
      id: number;
      subject: string;
      exam_year: number | null;
      saved_correct_option: string;
      verified_correct_option: string;
      reason: string;
    }> = [];

    let passed = 0;
    let corrected = 0;
    let failed = 0;

    for (const row of questions) {
      const subjectName =
        subjectIdToName.get(row.subject_id) ?? "Unknown subject";

      try {
        const precheck = basicRowValidation(row);
        const saved = String(row.correct_option ?? "").trim().toUpperCase();

        if (!precheck.valid) {
          failed += 1;
          mismatches.push({
            id: row.id,
            subject: subjectName,
            exam_year: row.exam_year,
            saved_correct_option: saved,
            verified_correct_option: "",
            reason: precheck.reason,
          });

          if (!dryRun) {
            await supabaseAdmin
              .from("questions")
              .update({
                verification_status: "fail",
                verification_notes: precheck.reason,
                last_verified_at: new Date().toISOString(),
              })
              .eq("id", row.id);
          }

          continue;
        }

        const verification = await verifyQuestion(openai, subjectName, row);
        const verified = verification.correct_option;

        const canPass = verification.status === "pass" && saved === verified;
        const canCorrect = verification.status === "pass" && saved !== verified;

        if (canPass) {
          passed += 1;

          if (!dryRun) {
            const { error: updateErr } = await supabaseAdmin
              .from("questions")
              .update({
                verification_status: "pass",
                verification_notes:
                  verification.reason || "Verified successfully",
                verified_correct_option: verified,
                last_verified_at: new Date().toISOString(),
                explanation:
                  verification.fixed_explanation || row.explanation || null,
              })
              .eq("id", row.id);

            if (updateErr) {
              throw new Error(
                `Update failed for question ${row.id}: ${updateErr.message}`
              );
            }
          }

          continue;
        }

        if (canCorrect) {
          corrected += 1;

          mismatches.push({
            id: row.id,
            subject: subjectName,
            exam_year: row.exam_year,
            saved_correct_option: saved,
            verified_correct_option: verified,
            reason:
              verification.reason ||
              `Correct option changed from ${saved} to ${verified}`,
          });

          if (!dryRun) {
            const { error: updateErr } = await supabaseAdmin
              .from("questions")
              .update({
                correct_option: verified,
                verified_correct_option: verified,
                verification_status: "corrected",
                verification_notes:
                  verification.reason ||
                  `Correct option changed from ${saved} to ${verified}`,
                explanation:
                  verification.fixed_explanation || row.explanation || null,
                last_verified_at: new Date().toISOString(),
              })
              .eq("id", row.id);

            if (updateErr) {
              throw new Error(
                `Update failed for question ${row.id}: ${updateErr.message}`
              );
            }
          }

          continue;
        }

        failed += 1;
        mismatches.push({
          id: row.id,
          subject: subjectName,
          exam_year: row.exam_year,
          saved_correct_option: saved,
          verified_correct_option: verified || "",
          reason: verification.reason || "Question failed verification",
        });

        if (!dryRun) {
          const { error: updateErr } = await supabaseAdmin
            .from("questions")
            .update({
              verification_status: "fail",
              verification_notes:
                verification.reason || "Question failed verification",
              verified_correct_option: verified || null,
              last_verified_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (updateErr) {
            throw new Error(
              `Update failed for question ${row.id}: ${updateErr.message}`
            );
          }
        }
      } catch (err: any) {
        failed += 1;
        mismatches.push({
          id: row.id,
          subject: subjectName,
          exam_year: row.exam_year,
          saved_correct_option: String(row.correct_option ?? "")
            .trim()
            .toUpperCase(),
          verified_correct_option: "",
          reason: err?.message || "Verification failed",
        });

        if (!dryRun) {
          await supabaseAdmin
            .from("questions")
            .update({
              verification_status: "fail",
              verification_notes: err?.message || "Verification failed",
              last_verified_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
      }
    }

    return NextResponse.json({
      message: dryRun
        ? "Verification completed in dry-run mode"
        : "Verification completed and database updated",
      checked: questions.length,
      passed,
      corrected,
      failed,
      mismatches,
      dry_run: dryRun,
      offset,
      limit,
      year_from: yearFrom,
      year_to: yearTo,
      subjects: matchingSubjects.map((s) => s.name),
    });
  } catch (e: any) {
    console.error("verify-saved-questions route error:", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Server error",
        details:
          typeof e?.stack === "string" && e.stack.trim()
            ? e.stack
            : typeof e?.cause === "string"
              ? e.cause
              : null,
      },
      { status: 500 }
    );
  }
}
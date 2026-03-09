import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeneratedQuestion = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
};

type VerificationInput = GeneratedQuestion;

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

function isValidCorrectOption(v: string) {
  return ["A", "B", "C", "D"].includes(String(v).toUpperCase());
}

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normalizeGeneratedQuestion(row: Partial<GeneratedQuestion>): GeneratedQuestion {
  return {
    question: normalizeText(row.question),
    option_a: normalizeText(row.option_a),
    option_b: normalizeText(row.option_b),
    option_c: normalizeText(row.option_c),
    option_d: normalizeText(row.option_d),
    correct_option: String(row.correct_option ?? "")
      .replace(".", "")
      .trim()
      .toUpperCase(),
    explanation: normalizeText(row.explanation),
  };
}

function getOptionMap(row: GeneratedQuestion) {
  return {
    A: row.option_a,
    B: row.option_b,
    C: row.option_c,
    D: row.option_d,
  } as const;
}

function hasDuplicateOptions(row: GeneratedQuestion) {
  const values = [row.option_a, row.option_b, row.option_c, row.option_d]
    .map((v) => v.trim().toLowerCase());
  return new Set(values).size !== values.length;
}

function validateGeneratedQuestion(row: GeneratedQuestion) {
  const okText =
    !!row.question &&
    !!row.option_a &&
    !!row.option_b &&
    !!row.option_c &&
    !!row.option_d &&
    !!row.explanation;

  if (!okText) {
    return { valid: false, reason: "Missing required fields" };
  }

  if (!isValidCorrectOption(row.correct_option)) {
    return { valid: false, reason: "Invalid correct_option" };
  }

  if (hasDuplicateOptions(row)) {
    return { valid: false, reason: "Duplicate options detected" };
  }

  const optionMap = getOptionMap(row);
  const selected = optionMap[row.correct_option as keyof typeof optionMap];

  if (!selected) {
    return { valid: false, reason: "Marked answer does not map to an option" };
  }

  return { valid: true, reason: "" };
}

function explanationAppearsConsistent(row: GeneratedQuestion) {
  const optionMap = getOptionMap(row);
  const selected = optionMap[row.correct_option as keyof typeof optionMap];
  const e = row.explanation.toLowerCase();
  const selectedNorm = selected.toLowerCase();

  return (
    e.includes(selectedNorm) ||
    e.includes(`option ${row.correct_option.toLowerCase()}`) ||
    e.includes(`correct option is ${row.correct_option.toLowerCase()}`) ||
    e.includes(`answer is ${row.correct_option.toLowerCase()}`)
  );
}

async function generateQuestions(
  openai: OpenAI,
  input: {
    count: number;
    subjectName: string;
    topic: string;
    difficulty: string;
    year: number;
  }
) {
  const prompt = `
Generate ${input.count} original JAMB-style multiple choice questions.

Rules:
- Subject: ${input.subjectName}
- Topic: ${input.topic}
- Difficulty: ${input.difficulty}
- Year tag: ${input.year}
- Make them original, not copied from any real exam paper.
- Use clear Nigerian secondary-school exam style.
- Make distractors realistic and challenging.
- Ensure exactly one correct answer.
- The correct_option MUST match the actually correct option.
- Do NOT default to A.
- The explanation MUST agree with the correct_option.
- The explanation must be concise and show why the answer is correct.
- Return ONLY valid JSON.
- Do not include markdown fences.

Return this exact JSON shape:
{
  "questions": [
    {
      "question": "string",
      "option_a": "string",
      "option_b": "string",
      "option_c": "string",
      "option_d": "string",
      "correct_option": "A",
      "explanation": "string"
    }
  ]
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a careful exam-item writer. Return strict JSON only. Check that the marked answer is truly correct before finalizing.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";

  if (!raw) {
    throw new Error("OpenAI returned empty content");
  }

  let parsed: { questions?: Partial<GeneratedQuestion>[] } | null = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${raw}`);
  }

  return Array.isArray(parsed?.questions) ? parsed.questions : [];
}

async function verifyQuestion(
  openai: OpenAI,
  question: VerificationInput
): Promise<VerificationResult> {
  const verifierPrompt = `
You are a mathematics exam verifier.

Check this multiple-choice question carefully.

Requirements:
1. Confirm whether the marked correct option is actually correct.
2. Confirm the explanation agrees with the correct option.
3. Confirm there is exactly one best answer.
4. If the marked answer is wrong, correct it.
5. If the explanation is weak or inconsistent, rewrite it.
6. Return ONLY valid JSON.

Question JSON:
${JSON.stringify(question, null, 2)}

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
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict exam-quality verifier. Return strict JSON only. Reject or correct any answer-key mismatch.",
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

    const subject_id = Number(body?.subject_id);
    const year = Number(body?.year);
    const count = Number(body?.count);
    const topic = String(body?.topic ?? "").trim();
    const difficulty = String(body?.difficulty ?? "medium")
      .trim()
      .toLowerCase();
    const source = String(body?.source ?? "AceUTME AI").trim();
    const is_past_question = Boolean(body?.is_past_question ?? false);

    if (!subject_id || Number.isNaN(subject_id)) {
      return NextResponse.json({ error: "Invalid subject_id" }, { status: 400 });
    }

    if (!year || Number.isNaN(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    if (!count || Number.isNaN(count) || count < 1 || count > 200) {
      return NextResponse.json(
        { error: "count must be between 1 and 200" },
        { status: 400 }
      );
    }

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const { data: subject, error: subjectErr } = await supabaseAdmin
      .from("subjects")
      .select("id,name")
      .eq("id", subject_id)
      .maybeSingle();

    if (subjectErr) {
      return NextResponse.json(
        { error: "Failed to validate subject", details: subjectErr.message },
        { status: 500 }
      );
    }

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 400 });
    }

    const generated = await generateQuestions(openai, {
      count,
      subjectName: subject.name,
      topic,
      difficulty,
      year,
    });

    const normalized = generated.map(normalizeGeneratedQuestion);

    const preValidated = normalized
      .map((q) => ({ q, check: validateGeneratedQuestion(q) }))
      .filter(({ check }) => check.valid)
      .map(({ q }) => q);

    const rejectedBeforeVerification = normalized.length - preValidated.length;

    if (preValidated.length === 0) {
      return NextResponse.json(
        { error: "No valid questions were generated before verification" },
        { status: 500 }
      );
    }

    const verifiedQuestions: Array<GeneratedQuestion & { verification_reason: string }> = [];
    const failedVerification: Array<{ question: string; reason: string }> = [];

    for (const q of preValidated) {
      try {
        const verification = await verifyQuestion(openai, q);

        const corrected: GeneratedQuestion = {
          ...q,
          correct_option: verification.correct_option,
          explanation: verification.fixed_explanation,
        };

        const correctedCheck = validateGeneratedQuestion(corrected);
        if (!correctedCheck.valid) {
          failedVerification.push({
            question: corrected.question,
            reason: correctedCheck.reason,
          });
          continue;
        }

        if (!explanationAppearsConsistent(corrected)) {
          failedVerification.push({
            question: corrected.question,
            reason: "Explanation still appears inconsistent with answer",
          });
          continue;
        }

        if (verification.status === "fail") {
          failedVerification.push({
            question: corrected.question,
            reason: verification.reason || "Verifier marked question as fail",
          });
          continue;
        }

        verifiedQuestions.push({
          ...corrected,
          verification_reason: verification.reason || "Verified successfully",
        });
      } catch (err: any) {
        failedVerification.push({
          question: q.question,
          reason: err?.message || "Verification failed",
        });
      }
    }

    if (verifiedQuestions.length === 0) {
      return NextResponse.json(
        {
          error: "All generated questions failed verification",
          rejected_before_verification: rejectedBeforeVerification,
          failed_verification: failedVerification,
        },
        { status: 500 }
      );
    }

    const rows = verifiedQuestions.map((r) => ({
      subject_id,
      question: r.question,
      option_a: r.option_a,
      option_b: r.option_b,
      option_c: r.option_c,
      option_d: r.option_d,
      correct_option: r.correct_option,
      explanation: r.explanation,
      topic,
      exam_year: year,
      difficulty,
      is_past_question,
      source,
      verification_status: "pass",
      verification_notes: r.verification_reason,
    }));

    const chunkSize = 200;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      const { error } = await supabaseAdmin.from("questions").insert(chunk);

      if (error) {
        return NextResponse.json(
          { error: "Insert failed", details: error.message },
          { status: 500 }
        );
      }

      inserted += chunk.length;
    }

    return NextResponse.json({
      message: `✅ Generated and inserted ${inserted} verified questions for ${subject.name}`,
      inserted,
      requested: count,
      rejected_before_verification: rejectedBeforeVerification,
      failed_verification_count: failedVerification.length,
      failed_verification,
      subject_id,
      subject_name: subject.name,
      exam_year: year,
      topic,
      difficulty,
      source,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
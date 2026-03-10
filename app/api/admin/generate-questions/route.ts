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

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normLoose(v: unknown) {
  return normalizeText(v).toLowerCase();
}

function isValidCorrectOption(v: string) {
  return ["A", "B", "C", "D"].includes(String(v).trim().toUpperCase());
}

function getOptionMap(row: GeneratedQuestion) {
  return {
    A: row.option_a,
    B: row.option_b,
    C: row.option_c,
    D: row.option_d,
  } as const;
}

function extractLetterCandidate(raw: unknown) {
  const text = normalizeText(raw).toUpperCase();
  if (!text) return "";

  if (["A", "B", "C", "D"].includes(text)) {
    return text;
  }

  const patterns = [
    /\bOPTION\s*([ABCD])\b/i,
    /\bANSWER\s*[:\-]?\s*([ABCD])\b/i,
    /\bCORRECT\s*OPTION\s*[:\-]?\s*([ABCD])\b/i,
    /\bCHOICE\s*([ABCD])\b/i,
    /^\(?([ABCD])[\)\].:\-\s]?$/i,
    /\b([ABCD])[\)\].:]\b/i,
    /\b([ABCD])\b/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1] && ["A", "B", "C", "D"].includes(m[1].toUpperCase())) {
      return m[1].toUpperCase();
    }
  }

  return "";
}

function resolveCorrectOption(
  rawCorrectOption: unknown,
  options: { A: string; B: string; C: string; D: string }
) {
  const directLetter = extractLetterCandidate(rawCorrectOption);
  if (isValidCorrectOption(directLetter)) {
    return directLetter;
  }

  const rawText = normalizeText(rawCorrectOption);
  if (!rawText) return "";

  const rawNorm = normLoose(rawText);

  for (const [key, value] of Object.entries(options) as Array<
    ["A" | "B" | "C" | "D", string]
  >) {
    if (rawNorm === normLoose(value)) {
      return key;
    }
  }

  return "";
}

function hasDuplicateOptions(row: GeneratedQuestion) {
  const values = [row.option_a, row.option_b, row.option_c, row.option_d].map(
    (v) => normLoose(v)
  );
  return new Set(values).size !== values.length;
}

function normalizeGeneratedQuestion(
  row: Partial<GeneratedQuestion>
): GeneratedQuestion {
  const base: GeneratedQuestion = {
    question: normalizeText(row.question),
    option_a: normalizeText(row.option_a),
    option_b: normalizeText(row.option_b),
    option_c: normalizeText(row.option_c),
    option_d: normalizeText(row.option_d),
    correct_option: "",
    explanation: normalizeText(row.explanation),
  };

  base.correct_option = resolveCorrectOption(row.correct_option, {
    A: base.option_a,
    B: base.option_b,
    C: base.option_c,
    D: base.option_d,
  });

  return base;
}

function validateGeneratedQuestion(row: GeneratedQuestion) {
  const okText =
    !!row.question &&
    !!row.option_a &&
    !!row.option_b &&
    !!row.option_c &&
    !!row.option_d;

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

function buildSubjectSpecificPrompt(subjectName: string, topic: string) {
  const s = normLoose(subjectName);

  if (s.includes("chemistry")) {
    return `
Chemistry generation rules:
- Generate only academically correct Chemistry questions.
- Prefer standard senior secondary Chemistry content commonly tested in UTME/JAMB.
- For calculation questions, compute carefully before assigning the answer.
- For theory questions, ensure only one option is scientifically correct.
- Stay tightly within the topic "${topic}".
- Use proper chemical terminology and symbols where needed.
- Avoid two options being partially correct.
`.trim();
  }

  if (s.includes("mathematics") || s.includes("maths")) {
    return `
Mathematics generation rules:
- Solve the problem fully before assigning the answer key.
- Ensure the numeric result exactly matches one option.
- Avoid rounding ambiguity unless the question explicitly states approximation.
- Stay tightly within the topic "${topic}".
`.trim();
  }

  if (s.includes("english")) {
    return `
English generation rules:
- Ensure grammar, lexis, register, spelling, and comprehension logic are correct.
- Avoid multiple plausible answers.
- Stay tightly within the topic "${topic}".
`.trim();
  }

  return `
Subject-specific rules:
- Stay tightly within the topic "${topic}".
- Ensure the marked answer is the only best answer.
`.trim();
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
  const subjectSpecificRules = buildSubjectSpecificPrompt(
    input.subjectName,
    input.topic
  );

  const prompt = `
Generate ${input.count} original JAMB-style multiple choice questions.

Rules:
- Subject: ${input.subjectName}
- Topic: ${input.topic}
- Difficulty: ${input.difficulty}
- Year tag: ${input.year}
- Make them original and exam-ready.
- Use clear Nigerian secondary-school exam style.
- Make distractors realistic.
- Ensure exactly one best answer.
- "correct_option" MUST be exactly one of: "A", "B", "C", "D"
- Do NOT return "Option A", "A)", "A.", or the answer text itself.
- explanation should be short and useful.
- Do not include markdown fences.
- Do not include any extra keys.
- Return ONLY valid JSON.

${subjectSpecificRules}

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
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a careful exam-item writer. Return strict JSON only. correct_option must be exactly A, B, C, or D.",
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
  input: {
    subjectName: string;
    topic: string;
    difficulty: string;
    question: VerificationInput;
  }
): Promise<VerificationResult> {
  const verifierPrompt = `
You are a strict ${input.subjectName} exam verifier.

Check this multiple-choice question carefully.

Context:
- Subject: ${input.subjectName}
- Topic: ${input.topic}
- Difficulty: ${input.difficulty}

Requirements:
1. Confirm whether the marked correct option is actually correct.
2. Confirm there is exactly one best answer.
3. If the marked answer is wrong, correct it.
4. If the explanation is weak, rewrite it.
5. "correct_option" in your response MUST be exactly one of: "A", "B", "C", "D"
6. Return ONLY valid JSON.

Question JSON:
${JSON.stringify(input.question, null, 2)}

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
    temperature: 0.05,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict exam-quality verifier. Return strict JSON only. The field correct_option must be exactly one capital letter: A, B, C, or D.",
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

  const normalizedCorrectOption = resolveCorrectOption(parsed.correct_option, {
    A: input.question.option_a,
    B: input.question.option_b,
    C: input.question.option_c,
    D: input.question.option_d,
  });

  const result: VerificationResult = {
    status: parsed.status === "fail" ? "fail" : "pass",
    reason: normalizeText(parsed.reason),
    correct_option: normalizedCorrectOption,
    fixed_explanation:
      normalizeText(parsed.fixed_explanation) || input.question.explanation,
  };

  if (!isValidCorrectOption(result.correct_option)) {
    throw new Error("Verifier returned invalid correct_option");
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
      return NextResponse.json(
        { error: "Invalid subject_id" },
        { status: 400 }
      );
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

    const preValidatedResults = normalized.map((q) => ({
      q,
      check: validateGeneratedQuestion(q),
    }));

    const preValidated = preValidatedResults
      .filter(({ check }) => check.valid)
      .map(({ q }) => q);

    const rejectedBeforeVerificationItems = preValidatedResults
      .filter(({ check }) => !check.valid)
      .map(({ q, check }) => ({
        question: q.question || "(empty question)",
        reason: check.reason,
      }));

    const rejectedBeforeVerification = rejectedBeforeVerificationItems.length;

    if (preValidated.length === 0) {
      return NextResponse.json(
        {
          error: "No valid questions were generated",
          rejected_before_verification: rejectedBeforeVerification,
          rejected_before_verification_items: rejectedBeforeVerificationItems,
        },
        { status: 500 }
      );
    }

    const rowsToInsert: Array<{
      subject_id: number;
      question: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      correct_option: string;
      explanation: string;
      topic: string;
      exam_year: number;
      difficulty: string;
      is_past_question: boolean;
      source: string;
      verification_status: string;
      verification_notes: string | null;
    }> = [];

    const failedVerification: Array<{ question: string; reason: string }> = [];
    let verifiedCount = 0;
    let savedWithoutVerificationCount = 0;

    for (const q of preValidated) {
      try {
        const verification = await verifyQuestion(openai, {
          subjectName: subject.name,
          topic,
          difficulty,
          question: q,
        });

        const corrected: GeneratedQuestion = {
          ...q,
          correct_option: verification.correct_option,
          explanation: verification.fixed_explanation || q.explanation,
        };

        const correctedCheck = validateGeneratedQuestion(corrected);

        if (!correctedCheck.valid) {
          rowsToInsert.push({
            subject_id,
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_option: q.correct_option,
            explanation: q.explanation,
            topic,
            exam_year: year,
            difficulty,
            is_past_question,
            source,
            verification_status: "pending",
            verification_notes: `Saved without verified correction: ${correctedCheck.reason}`,
          });
          savedWithoutVerificationCount += 1;
          continue;
        }

        if (verification.status === "pass") {
          rowsToInsert.push({
            subject_id,
            question: corrected.question,
            option_a: corrected.option_a,
            option_b: corrected.option_b,
            option_c: corrected.option_c,
            option_d: corrected.option_d,
            correct_option: corrected.correct_option,
            explanation: corrected.explanation,
            topic,
            exam_year: year,
            difficulty,
            is_past_question,
            source,
            verification_status: "pass",
            verification_notes: verification.reason || "Verified successfully",
          });
          verifiedCount += 1;
        } else {
          rowsToInsert.push({
            subject_id,
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_option: q.correct_option,
            explanation: q.explanation,
            topic,
            exam_year: year,
            difficulty,
            is_past_question,
            source,
            verification_status: "pending",
            verification_notes:
              verification.reason || "Saved even though verification did not pass",
          });
          savedWithoutVerificationCount += 1;
        }
      } catch (err: any) {
        failedVerification.push({
          question: q.question,
          reason: err?.message || "Verification failed",
        });

        rowsToInsert.push({
          subject_id,
          question: q.question,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          explanation: q.explanation,
          topic,
          exam_year: year,
          difficulty,
          is_past_question,
          source,
          verification_status: "pending",
          verification_notes: err?.message || "Saved without verification",
        });
        savedWithoutVerificationCount += 1;
      }
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        {
          error: "No questions were available to insert",
          rejected_before_verification: rejectedBeforeVerification,
          rejected_before_verification_items: rejectedBeforeVerificationItems,
          failed_verification: failedVerification,
        },
        { status: 500 }
      );
    }

    const chunkSize = 200;
    let inserted = 0;

    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);

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
      message: `✅ Generated and inserted ${inserted} questions for ${subject.name}`,
      inserted,
      requested: count,
      verified_count: verifiedCount,
      saved_without_verification_count: savedWithoutVerificationCount,
      rejected_before_verification: rejectedBeforeVerification,
      rejected_before_verification_items: rejectedBeforeVerificationItems,
      failed_verification_count: failedVerification.length,
      failed_verification: failedVerification,
      subject_id,
      subject_name: subject.name,
      exam_year: year,
      topic,
      difficulty,
      source,
    });
  } catch (e: any) {
    console.error("generate-questions route error:", e);

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
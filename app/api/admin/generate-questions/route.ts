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
};

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
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

function normalizeGeneratedQuestion(row: Partial<GeneratedQuestion>) {
  return {
    question: String(row.question ?? "").trim(),
    option_a: String(row.option_a ?? "").trim(),
    option_b: String(row.option_b ?? "").trim(),
    option_c: String(row.option_c ?? "").trim(),
    option_d: String(row.option_d ?? "").trim(),
    correct_option: String(row.correct_option ?? "")
      .replace(".", "")
      .trim()
      .toUpperCase(),
  };
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

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
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
    const difficulty = String(body?.difficulty ?? "medium").trim().toLowerCase();
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

    const prompt = `
Generate ${count} original JAMB-style multiple choice questions.

Rules:
- Subject: ${subject.name}
- Topic: ${topic}
- Difficulty: ${difficulty}
- Year tag: ${year}
- Make them original, not copied from any real exam paper.
- Make distractors realistic and challenging.
- Ensure only one correct answer per question.
- Use clear Nigerian secondary-school exam style.
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
      "correct_option": "A"
    }
  ]
}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: "You are a careful exam-item writer. Return strict JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    if (!raw) {
      return NextResponse.json(
        { error: "OpenAI returned empty content" },
        { status: 500 }
      );
    }

    let parsed: { questions?: Partial<GeneratedQuestion>[] } | null = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "OpenAI returned invalid JSON", details: raw },
        { status: 500 }
      );
    }

    const generated = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const rows = generated
      .map(normalizeGeneratedQuestion)
      .filter((r) => {
        const okCorrect = isValidCorrectOption(r.correct_option);
        const okText =
          !!r.question &&
          !!r.option_a &&
          !!r.option_b &&
          !!r.option_c &&
          !!r.option_d;
        return okCorrect && okText;
      })
      .map((r) => ({
        subject_id,
        question: r.question,
        option_a: r.option_a,
        option_b: r.option_b,
        option_c: r.option_c,
        option_d: r.option_d,
        correct_option: r.correct_option,
        topic,
        exam_year: year,
        difficulty,
        is_past_question,
        source,
      }));

    const skipped = generated.length - rows.length;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid questions were generated", raw },
        { status: 500 }
      );
    }

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
      message: `✅ Generated and inserted ${inserted} questions for ${subject.name}`,
      inserted,
      skipped,
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
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExplainBody = {
  questionId?: number;
  subjectId?: number;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: "A" | "B" | "C" | "D" | string;
};

function clean(s: unknown) {
  return String(s ?? "").trim();
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function isPremiumActive(profile: { is_premium?: boolean | null; premium_until?: string | null } | null) {
  if (!profile?.is_premium) return false;
  if (!profile?.premium_until) return true;
  return new Date(profile.premium_until).getTime() > Date.now();
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase server environment variables" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response(
        JSON.stringify({ error: "AI explanation is available for Pro users only. Please log in again and upgrade to Pro." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Please log in again." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const user = authData.user;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("plan,is_premium,premium_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      return new Response(
        JSON.stringify({ error: profileErr.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const isPro = isPremiumActive(profile) || profile?.plan === "pro";

    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "AI explanation is available for Pro users only." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = (await req.json()) as Partial<ExplainBody>;

    const question = clean(body.question);
    const correctOption = clean(body.correctOption).toUpperCase();
    const A = clean(body.options?.A);
    const B = clean(body.options?.B);
    const C = clean(body.options?.C);
    const D = clean(body.options?.D);

    const questionId =
      typeof body.questionId === "number" && Number.isFinite(body.questionId)
        ? body.questionId
        : null;

    const subjectId =
      typeof body.subjectId === "number" && Number.isFinite(body.subjectId)
        ? body.subjectId
        : null;

    if (!question || !A || !B || !C || !D || !["A", "B", "C", "D"].includes(correctOption)) {
      return new Response(
        JSON.stringify({ error: "Missing/invalid fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const prompt = `
You are a JAMB tutor. Explain the correct answer in SIMPLE English suitable for a Nigerian secondary school student.
Be short, clear, and practical.

Context (optional):
- questionId: ${questionId ?? "N/A"}
- subjectId: ${subjectId ?? "N/A"}

Question:
${question}

Options:
A. ${A}
B. ${B}
C. ${C}
D. ${D}

Correct Option: ${correctOption}

Return EXACTLY in this format:

Correct: <LETTER>
Explanation: <2-5 short sentences>
Tip: <1 short tip>
`.trim();

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are a helpful, accurate tutor." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    const text =
      response.choices[0]?.message?.content ?? "No explanation returned.";

    return new Response(JSON.stringify({ explanation: text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
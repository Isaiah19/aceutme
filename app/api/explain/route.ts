import OpenAI from "openai";

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

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
        {
          status: 500,
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
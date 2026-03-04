import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, options, correctOption } = body;

    if (!question || !options || !correctOption) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    const prompt = `
You are a JAMB English tutor. Explain the correct answer in SIMPLE English suitable for a Nigerian secondary school student.
Be clear and short.

Question: ${question}

Options:
A. ${options.A}
B. ${options.B}
C. ${options.C}
D. ${options.D}

Correct Option: ${correctOption}

Return:
1) Correct option
2) Explanation
3) Quick tip to remember
`;

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are a helpful, accurate tutor." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    const text = response.choices[0]?.message?.content ?? "No explanation returned.";
    return new Response(JSON.stringify({ explanation: text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Server error" }), { status: 500 });
  }
}

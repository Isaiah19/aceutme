import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();

  const { subject_id, subject, topic, year, difficulty, count } = body;

  const prompt = `
Generate ${count} JAMB-style multiple choice questions.

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

Return JSON array like this:

[
{
question:"",
option_a:"",
option_b:"",
option_c:"",
option_d:"",
correct_option:"A"
}
]

Make the distractors realistic.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  const text = completion.choices[0].message.content || "[]";
  const questions = JSON.parse(text);

  const rows = questions.map((q: any) => ({
    subject_id,
    question: q.question,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    correct_option: q.correct_option,
    topic,
    year,
    difficulty,
    is_past_question: false,
    source: "AceUTME AI"
  }));

  await supabase.from("questions").insert(rows);

  return NextResponse.json({
    inserted: rows.length
  });
}

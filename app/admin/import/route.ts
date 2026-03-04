import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type IncomingRow = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
};

function isValidOption(x: any): x is "A" | "B" | "C" | "D" {
  return x === "A" || x === "B" || x === "C" || x === "D";
}

export async function POST(req: Request) {
  try {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!ADMIN_EMAIL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing server env vars. Check .env.local." }),
        { status: 500 }
      );
    }

    // Verify logged-in user via Supabase JWT
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return new Response(JSON.stringify({ error: "Missing auth token" }), { status: 401 });

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userRes, error: userErr } = await authClient.auth.getUser(token);

    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid login session" }), { status: 401 });
    }

    const email = userRes.user.email || "";
    if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403 });
    }

    const body = await req.json();
    const subjectId = Number(body.subjectId);
    const rows = body.rows as IncomingRow[];

    if (!Number.isFinite(subjectId) || subjectId <= 0) {
      return new Response(JSON.stringify({ error: "Invalid subjectId" }), { status: 400 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows to import" }), { status: 400 });
    }

    const cleaned = rows.map((r, idx) => {
      const correct = String(r.correct_option || "").trim().toUpperCase();
      if (
        !r.question ||
        !r.option_a ||
        !r.option_b ||
        !r.option_c ||
        !r.option_d ||
        !isValidOption(correct)
      ) {
        throw new Error(
          `Row ${idx + 1} invalid. Ensure all fields exist and correct_option is A/B/C/D.`
        );
      }
      return {
        subject_id: subjectId,
        question: String(r.question).trim(),
        option_a: String(r.option_a).trim(),
        option_b: String(r.option_b).trim(),
        option_c: String(r.option_c).trim(),
        option_d: String(r.option_d).trim(),
        correct_option: correct,
      };
    });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const chunkSize = 500;
    let inserted = 0;

    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const { error } = await adminClient.from("questions").insert(chunk);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      inserted += chunk.length;
    }

    return new Response(JSON.stringify({ ok: true, inserted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Server error" }), { status: 500 });
  }
}

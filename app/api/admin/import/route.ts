import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Server-side Supabase client using SERVICE ROLE (admin privileges)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

type CsvRow = {
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

export async function POST(req: Request) {
  try {
    // ✅ ADMIN GATE (server-side)
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: missing Bearer token" }, { status: 401 });
    }

    // Validate token -> get user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized: invalid token" }, { status: 401 });
    }

    // Check is_admin in profiles
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", authData.user.id)
      .single();

    if (profErr || !prof?.is_admin) {
      return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
    }

    // ✅ Continue with import
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const subjectIdRaw = formData.get("subjectId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const subject_id = Number(subjectIdRaw);
    if (!subject_id || Number.isNaN(subject_id)) {
      return NextResponse.json({ error: "Invalid subjectId" }, { status: 400 });
    }

    const text = await file.text();

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors?.length) {
      return NextResponse.json(
        { error: "CSV parse error", details: parsed.errors },
        { status: 400 }
      );
    }

    const rows = (parsed.data || []).map((r) => ({
      subject_id,
      question: (r.question ?? "").trim(),
      option_a: (r.option_a ?? "").trim(),
      option_b: (r.option_b ?? "").trim(),
      option_c: (r.option_c ?? "").trim(),
      option_d: (r.option_d ?? "").trim(),
      correct_option: (r.correct_option ?? "").trim().toUpperCase(),
    }));

    // Validate rows
    const valid = rows.filter((r) => {
      const okCorrect = ["A", "B", "C", "D"].includes(r.correct_option);
      const okText = r.question && r.option_a && r.option_b && r.option_c && r.option_d;
      return okCorrect && okText;
    });

    if (valid.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid rows found. Check headers and ensure correct_option is A/B/C/D.",
        },
        { status: 400 }
      );
    }

    // Insert in chunks (safe for large CSV)
    const chunkSize = 500;
    let inserted = 0;

    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize);

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
      message: `✅ Imported ${inserted} questions into subjectId=${subject_id}`,
      inserted,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
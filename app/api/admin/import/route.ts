import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function isValidCorrectOption(v: string) {
  return ["A", "B", "C", "D"].includes(String(v).toUpperCase());
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

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

    const formData = await req.formData();
    const file = formData.get("file");

    const subjectIdRaw = formData.get("subjectId");
    const subject_id = Number(subjectIdRaw);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!subject_id || Number.isNaN(subject_id)) {
      return NextResponse.json({ error: "Invalid subjectId" }, { status: 400 });
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

    const valid = rows.filter((r) => {
      const okCorrect = isValidCorrectOption(r.correct_option);
      const okText =
        !!r.question &&
        !!r.option_a &&
        !!r.option_b &&
        !!r.option_c &&
        !!r.option_d;
      return okCorrect && okText;
    });

    const skipped = rows.length - valid.length;

    if (valid.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid rows found. Check headers and ensure correct_option is A/B/C/D.",
        },
        { status: 400 }
      );
    }

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
      message: `✅ Imported ${inserted} questions into ${subject.name}`,
      inserted,
      skipped,
      subject_id,
      subject_name: subject.name,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
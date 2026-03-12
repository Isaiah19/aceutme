import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function getBearerToken(req: Request) {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const category = String(body?.category ?? "general").trim();
    const page = String(body?.page ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Feedback message is required" },
        { status: 400 }
      );
    }

    let userId: string | null = null;
    let email: string | null = null;

    if (token) {
      const { data: authData } = await supabaseAdmin.auth.getUser(token);
      userId = authData?.user?.id ?? null;
      email = authData?.user?.email ?? null;
    }

    const { error } = await supabaseAdmin.from("feedback").insert({
      user_id: userId,
      email,
      page: page || null,
      category: category || "general",
      message,
      status: "new",
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to save feedback", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

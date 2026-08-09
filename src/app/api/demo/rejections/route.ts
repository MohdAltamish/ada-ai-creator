import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// §6: Rejections endpoint for the Editorial Judgment Log panel.
// GET /api/demo/rejections?agentId=...&limit=5
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 5);

  if (!agentId) {
    return NextResponse.json(
      { error: "agentId is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rejections")
    .select("id, title, source, reason, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "failed to load rejections" },
      { status: 500 }
    );
  }

  return NextResponse.json({ rejections: data ?? [] });
}

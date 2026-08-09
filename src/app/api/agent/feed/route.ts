import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { maybeCatchUpPublish } from "@/lib/publish";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  // The lazy trigger: if a publish is overdue, generate it now, before
  // responding. This is what makes "autonomous over 48h" true regardless of
  // whether the process has been sitting idle.
  try {
    await maybeCatchUpPublish(agentId);
  } catch (e) {
    console.error("catch-up publish failed:", e);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "failed to load feed" }, { status: 500 });
  }

  const posts = (data ?? []).map((p: any) => ({
    id: p.id,
    createdAt: p.created_at,
    text: p.text,
    rationale: p.rationale,
    sources: p.sources ?? [],
  }));

  return NextResponse.json({ posts });
}

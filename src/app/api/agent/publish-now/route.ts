import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { publishOnce } from "@/lib/publish";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!agent) {
      return NextResponse.json({ error: "No agent initialized yet" }, { status: 400 });
    }

    const post = await publishOnce(agent.id);
    return NextResponse.json({ ok: true, post });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to publish" }, { status: 500 });
  }
}

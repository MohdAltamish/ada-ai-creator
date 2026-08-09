import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { setPublishInterval } from "@/lib/publish";

// §5/§6: Per-agent interval update — persists to DB and updates in-memory global.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const minutes = Number(body.interval);
    if (!minutes && minutes !== 0) {
      return NextResponse.json(
        { error: "interval (minutes) is required" },
        { status: 400 }
      );
    }

    // Update the in-memory global as a fallback
    setPublishInterval(minutes);

    // Persist to the latest agent's row in DB
    const supabase = getSupabase();
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (agent) {
      await supabase
        .from("agents")
        .update({ interval_minutes: minutes })
        .eq("id", agent.id);
    }

    return NextResponse.json({ ok: true, interval: minutes });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to set interval" },
      { status: 500 }
    );
  }
}

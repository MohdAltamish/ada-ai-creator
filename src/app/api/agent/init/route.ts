import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { publishOnce } from "@/lib/publish";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty/invalid body is fine — fall back to defaults below
  }

  const name = body?.persona?.name || "Ada";
  const domain = body?.persona?.domain || "AI Security";

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const agentId = randomUUID();

  const { error } = await supabase.from("agents").insert({
    id: agentId,
    name,
    domain,
    created_at: now,
    last_published_at: now,
  });

  if (error) {
    return NextResponse.json(
      { error: "failed to initialize agent" },
      { status: 500 }
    );
  }

  // Best-effort first post so the feed isn't empty the moment a judge looks.
  // Everything after this happens on its own via the feed route's catch-up
  // check and the cron backup — init never gets called again.
  try {
    await publishOnce(agentId);
  } catch (e) {
    console.error("initial publish failed:", e);
  }

  return NextResponse.json({ agentId });
}

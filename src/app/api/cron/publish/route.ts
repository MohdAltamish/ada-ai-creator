import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { maybeCatchUpPublish } from "@/lib/publish";

// Backup trigger only. The feed route's lazy catch-up is the primary
// mechanism and works even if this never fires (e.g. Vercel Hobby plan
// restricts cron frequency). This just covers the case where nobody polls
// the feed for a long stretch.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: agents } = await supabase.from("agents").select("id");

  for (const a of agents ?? []) {
    try {
      await maybeCatchUpPublish(a.id as string);
    } catch (e) {
      console.error("cron publish failed for", a.id, e);
    }
  }

  return NextResponse.json({ ok: true, checked: agents?.length ?? 0 });
}

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Convenience-only endpoint for the demo homepage — not part of the spec.
// Lets the UI find the most recently init'd agent without you pasting an id.
export async function GET() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("agents")
    .select("id, name, domain, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ agent: data ?? null });
}

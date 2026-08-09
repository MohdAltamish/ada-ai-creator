import { NextRequest, NextResponse } from "next/server";
import { setPublishInterval, PUBLISH_INTERVAL_MINUTES } from "@/lib/publish";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.interval === "number") {
      setPublishInterval(body.interval);
    }
    return NextResponse.json({ ok: true, interval: PUBLISH_INTERVAL_MINUTES });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to set interval" }, { status: 500 });
  }
}

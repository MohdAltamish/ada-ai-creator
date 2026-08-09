import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/oauth";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  // Generate state token for CSRF protection
  const state = randomUUID();
  const authUrl = buildAuthorizationUrl(state);

  const res = NextResponse.redirect(authUrl);

  // Store state in short-lived HttpOnly cookie for CSRF validation in callback
  res.cookies.set("featherless_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  return res;
}

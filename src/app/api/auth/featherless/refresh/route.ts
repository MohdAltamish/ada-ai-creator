import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/oauth";

export async function POST(req: NextRequest) {
  let refreshToken = req.cookies.get("featherless_refresh_token")?.value;

  if (!refreshToken) {
    try {
      const body = await req.json();
      refreshToken = body?.refresh_token;
    } catch {
      // ignore json parse errors
    }
  }

  if (!refreshToken) {
    return NextResponse.json(
      { error: "Missing refresh_token in cookie or request body" },
      { status: 400 }
    );
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);

    const res = NextResponse.json({
      ok: true,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    });

    const maxAge = tokens.expires_in || 3600 * 24 * 7;

    res.cookies.set("featherless_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge,
      path: "/",
    });

    if (tokens.refresh_token) {
      res.cookies.set("featherless_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3600 * 24 * 30,
        path: "/",
      });
    }

    return res;
  } catch (err: any) {
    console.error("Featherless OAuth token refresh error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to refresh token" },
      { status: 500 }
    );
  }
}

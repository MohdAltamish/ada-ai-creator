import { NextRequest, NextResponse } from "next/server";
import { callAuthenticatedAPI, refreshAccessToken } from "@/lib/oauth";

/**
 * Sample authenticated endpoint calling Featherless API on behalf of the user.
 * Demonstrates:
 * 1. Extracting access_token from HttpOnly cookie or Authorization header.
 * 2. Calling Featherless API with `Authorization: Bearer <access_token>`.
 * 3. Automatic token refresh if 401 Unauthorized is returned.
 */
export async function GET(req: NextRequest) {
  let accessToken =
    req.cookies.get("featherless_access_token")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const refreshToken = req.cookies.get("featherless_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in with Featherless OAuth first." },
      { status: 401 }
    );
  }

  // Helper to attempt the API request
  async function attemptApiRequest(token: string) {
    // Sample endpoint: fetch user models or user profile from Featherless API
    return await callAuthenticatedAPI("/v1/models", token, { method: "GET" });
  }

  try {
    if (accessToken) {
      try {
        const data = await attemptApiRequest(accessToken);
        return NextResponse.json({ ok: true, data });
      } catch (err: any) {
        // If 401 or expired, fall through to refresh flow if refresh token is available
        if (!err.message?.includes("401") || !refreshToken) {
          throw err;
        }
      }
    }

    // Access token missing or expired — refresh token flow
    if (refreshToken) {
      const newTokens = await refreshAccessToken(refreshToken);

      const data = await attemptApiRequest(newTokens.access_token);

      const res = NextResponse.json({
        ok: true,
        refreshed: true,
        data,
      });

      // Update cookies with new access token
      res.cookies.set("featherless_access_token", newTokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: newTokens.expires_in || 3600 * 24 * 7,
        path: "/",
      });

      return res;
    }

    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to make authenticated Featherless API call" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const state = url.searchParams.get("state");

  const savedState = req.cookies.get("featherless_oauth_state")?.value;

  // 1. Handle error response from authorization server (e.g. user denied consent)
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/?oauth_error=${encodeURIComponent(errorDescription || error)}`,
        req.url
      )
    );
  }

  // 2. Validate state to prevent CSRF attacks
  if (state && savedState && state !== savedState) {
    return NextResponse.redirect(
      new URL("/?oauth_error=CSRF+state+mismatch", req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?oauth_error=Missing+authorization+code", req.url)
    );
  }

  try {
    // 3. Server-side code exchange
    const tokens = await exchangeCodeForTokens(code);

    const redirectUrl = new URL("/?oauth_success=true", req.url);
    const res = NextResponse.redirect(redirectUrl);

    // Clear state cookie
    res.cookies.delete("featherless_oauth_state");

    // Store tokens in secure, HttpOnly cookies
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
        maxAge: 3600 * 24 * 30, // 30 days
        path: "/",
      });
    }

    return res;
  } catch (err: any) {
    console.error("Featherless OAuth exchange error:", err);
    return NextResponse.redirect(
      new URL(
        `/?oauth_error=${encodeURIComponent(err.message || "Failed to exchange code")}`,
        req.url
      )
    );
  }
}

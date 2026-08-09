// Featherless OAuth 2.0 Authorization Code Grant Client
// Per specification: Server-side only token exchange & secret management

export interface FeatherlessTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export function getOAuthConfig() {
  const clientId =
    process.env.FEATHERLESS_CLIENT_ID &&
    process.env.FEATHERLESS_CLIENT_ID !== "YOUR_CLIENT_ID"
      ? process.env.FEATHERLESS_CLIENT_ID
      : "app_mfuaETjlur23Zlw0";

  const clientSecret =
    process.env.FEATHERLESS_CLIENT_SECRET &&
    process.env.FEATHERLESS_CLIENT_SECRET !== "YOUR_CLIENT_SECRET"
      ? process.env.FEATHERLESS_CLIENT_SECRET
      : "secret_qJ-DHBxI5BQXJFDl5qmVA5g0CDwzvXOX";

  const redirectUri =
    process.env.FEATHERLESS_REDIRECT_URI ||
    "http://localhost:3000/api/auth/featherless/callback";
  const scopes =
    process.env.FEATHERLESS_SCOPES || "api.access user.read user.write";

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    authUrl: "https://featherless.ai/oauth/authorize",
    tokenUrl: "https://api.featherless.ai/oauth/token",
    apiBaseUrl: "https://api.featherless.ai",
  };
}

/**
 * 1. Generates the Featherless authorization URL for user browser redirect.
 */
export function buildAuthorizationUrl(state?: string): string {
  const config = getOAuthConfig();

  const query =
    `client_id=${encodeURIComponent(config.clientId)}` +
    `&scope=${encodeURIComponent(config.scopes)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    (state ? `&state=${encodeURIComponent(state)}` : "");

  return `${config.authUrl}?${query}`;
}

/**
 * 3. Server-side code -> token exchange.
 * POST application/x-www-form-urlencoded to https://api.featherless.ai/oauth/token
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<FeatherlessTokenResponse> {
  const config = getOAuthConfig();

  if (!config.clientSecret) {
    throw new Error("Missing FEATHERLESS_CLIENT_SECRET environment variable");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `Token exchange failed (${res.status}): ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }

  return data as FeatherlessTokenResponse;
}

/**
 * 5. Server-side refresh token exchange when access token expires.
 * POST application/x-www-form-urlencoded to https://api.featherless.ai/oauth/token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<FeatherlessTokenResponse> {
  const config = getOAuthConfig();

  if (!config.clientSecret) {
    throw new Error("Missing FEATHERLESS_CLIENT_SECRET environment variable");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `Token refresh failed (${res.status}): ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }

  return data as FeatherlessTokenResponse;
}

/**
 * 4. Sample authenticated API request on behalf of the signed-in user.
 * Header: Authorization: Bearer <access_token>
 */
export async function callAuthenticatedAPI<T = unknown>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getOAuthConfig();
  const url = `${config.apiBaseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Featherless API error (${res.status}): ${text}`);
  }

  return res.json() as T;
}

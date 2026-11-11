"use strict";

import crypto from "crypto";

/**
 * OAuth 2.0 + PKCE against Home Connect's SingleKey ID, exactly as the
 * official BSH app does it (see hcpy's hc-login.py). This module is the
 * pure-logic half of the one-time cloud key-exchange: no Homey dependency,
 * no network state - just URL building and the token requests.
 *
 * The `redirect_uri` is the fixed custom scheme `hcauth://auth/prod`, which
 * a browser/webview cannot follow. The authorization `code` therefore only
 * reaches exchangeCode() via one of two routes:
 *   - the on-Homey proxy intercepts the hcauth:// redirect server-side, or
 *   - the user pastes the hcauth:// URL back manually.
 * Both end up calling parseRedirectUrl() + exchangeCode() here.
 */

const AUTH_BASE = "https://api.home-connect.com/security/oauth";
export const REDIRECT_URI = "hcauth://auth/prod";
const SCOPE = "ReadOrigApi";

export interface PkcePair {
  verifier: string;
  challenge: string;
  /** CSRF token echoed back in the redirect; must match on return. */
  state: string;
  nonce: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Step 1a: a fresh PKCE verifier/challenge plus CSRF state and nonce. */
export function createPkce(): PkcePair {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return {
    verifier,
    challenge,
    state: b64url(crypto.randomBytes(16)),
    nonce: b64url(crypto.randomBytes(16)),
  };
}

/** Step 1b: the URL the user signs in at (proxied iframe, or their own browser). */
export function buildAuthorizeUrl(pkce: PkcePair, clientId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    prompt: "login",
    client_id: clientId,
    scope: SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: pkce.state,
    nonce: pkce.nonce,
    redirect_uri: REDIRECT_URI,
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

/** Step 3: exchange the authorization `code` for an access + refresh token. */
export function exchangeCode(
  code: string,
  verifier: string,
  clientId: string,
): Promise<TokenSet> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  );
}

/** Trade a stored refresh token for a fresh access token (the "Refresh" button). */
export function refreshAccessToken(refreshToken: string, clientId: string): Promise<TokenSet> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  );
}

async function requestToken(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

/**
 * Parse `code` + `state` out of what the user pasted. Ideally that is the
 * `hcauth://auth/prod?code=...&state=...` URL, but in practice people paste:
 *   - the URL with surrounding text (copied from a DevTools row or error page),
 *   - a URL-encoded copy ("hcauth%3A%2F%2Fauth%2Fprod%3Fcode%3D..."),
 *   - the SingleKey ID / authorize page URL from the address bar instead.
 * The custom scheme isn't reliably handled by the URL constructor, so we
 * slice off the query string ourselves.
 */
export function parseRedirectUrl(raw: string): { code: string; state: string } {
  let text = raw.trim();
  if (!text) throw new Error("Paste the hcauth:// URL first");

  // Undo URL-encoding (possibly applied more than once) until it settles.
  for (let i = 0; i < 3 && /%3a|%3f|%3d|%26|%25/i.test(text); i++) {
    try {
      text = decodeURIComponent(text);
    } catch {
      break;
    }
  }

  // Pick the hcauth:// URL out of any surrounding text.
  const embedded = text.match(/hcauth:\/\/[^\s"'<>]+/i);
  if (embedded) {
    text = embedded[0];
  } else if (/^https?:\/\//i.test(text)) {
    throw new Error(
      "This is the address of the login page, not the hcauth:// redirect. After logging in, " +
        "copy the hcauth://auth/prod?code=... address from the network inspector (see the steps above).",
    );
  }

  const qIndex = text.indexOf("?");
  if (qIndex === -1) {
    throw new Error("That doesn't look like the hcauth:// redirect URL - it has no '?code=...' part");
  }
  const params = new URLSearchParams(text.slice(qIndex + 1).replace(/&amp;/g, "&"));
  const error = params.get("error");
  if (error) {
    throw new Error(`Authorization failed: ${error} ${params.get("error_description") ?? ""}`.trim());
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code) {
    throw new Error(
      `No 'code' parameter found in the pasted URL (it starts with "${text.slice(0, 40)}…"). ` +
        "Make sure you copy the complete hcauth://auth/prod?code=... address.",
    );
  }
  if (!state) throw new Error("No 'state' parameter found in the redirect URL - was it cut off?");
  return { code, state };
}

/** Decode the `sub` (account id) claim out of a JWT access token, without verifying. */
export function jwtSubject(accessToken: string): string {
  const parts = accessToken.split(".");
  if (parts.length !== 3) throw new Error("Access token is not a JWT");
  const payloadJson = Buffer.from(
    parts[1].replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
  const sub = (JSON.parse(payloadJson) as { sub?: string }).sub;
  if (!sub) throw new Error("Access token has no 'sub' claim");
  return sub;
}

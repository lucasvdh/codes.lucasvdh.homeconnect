"use strict";

import crypto from "crypto";

// As the official app does it (hcpy hc-login.py). A browser can't follow the hcauth:// redirect,
// so the user pastes it back.

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
  /** Epoch ms. */
  expiresAt: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

// People paste the URL with surrounding text, URL-encoded, or the login page URL instead (#21).
// URL() doesn't reliably parse the custom scheme, so the query string is sliced off by hand.
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

// Not verified: only used as an account id.
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

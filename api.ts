"use strict";

import { randomUUID } from "crypto";

import { DeviceConfig } from "./lib/types";
import {
  PkcePair,
  TokenSet,
  buildAuthorizeUrl,
  createPkce,
  exchangeCode,
  parseRedirectUrl,
  refreshAccessToken,
} from "./lib/home-connect-oauth";
import { discoverAppliances } from "./lib/home-connect-discovery";
import { normalizeDeviceConfigs } from "./lib/device-config";

// The SingleKey login can't be proxied (hCaptcha is host-locked to singlekey-id.com), so the
// user signs in in their own browser and pastes the hcauth:// redirect back.

const EVENT_PROGRESS = "homeconnect:run:progress";
const EVENT_DONE = "homeconnect:run:done";
const EVENT_ERROR = "homeconnect:run:error";

interface ApiArgs {
  homey: any;
}

interface BodyArgs<T> extends ApiArgs {
  body: T;
}

// Lost on restart; acceptable, the user can generate a new login link.
const manualSessions = new Map<string, PkcePair>();

module.exports = {
  async getStatus({ homey }: ApiArgs) {
    const devices: DeviceConfig[] = homey.app.getDevices();
    return {
      hasRefreshToken: homey.app.getRefreshToken() != null,
      devices: devices.map((d) => ({
        haId: d.haId,
        name: d.name,
        brand: d.description?.brand ?? "",
        type: d.description?.type ?? "",
        model: d.description?.model ?? "",
        protocol: d.iv ? "AES" : "TLS-PSK",
        connection: d.haId ? homey.app.connectionStatus.get(d.haId) : {},
      })),
    };
  },

  async startManualAuth({ homey }: ApiArgs) {
    const pkce = createPkce();
    const pkceId = randomUUID();
    manualSessions.set(pkceId, pkce);
    return {
      pkceId,
      authorizeUrl: buildAuthorizeUrl(pkce, homey.app.clientId),
    };
  },

  async submitRedirectUrl({ homey, body }: BodyArgs<{ pkceId: string; url: string }>) {
    const pkce = manualSessions.get(body.pkceId);
    if (!pkce) throw new Error("Login session expired - generate a new login link");

    const { code, state } = parseRedirectUrl(body.url);
    if (state !== pkce.state) {
      throw new Error("State mismatch - the pasted URL is from a different login attempt");
    }
    manualSessions.delete(body.pkceId);

    const runId = runInBackground(homey, async (onProgress) => {
      onProgress("Exchanging the authorization code…");
      const token = await exchangeCode(code, pkce.verifier, homey.app.clientId);
      return ingestFromCloud(homey, token, onProgress);
    });
    return { runId };
  },

  async importDevices({ homey, body }: BodyArgs<{ json: string }>) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.json);
    } catch (err) {
      throw new Error(`That is not valid JSON: ${(err as Error).message}`);
    }
    const devices = normalizeDeviceConfigs(parsed);
    await homey.app.setDevices(devices);
    return { deviceCount: devices.length };
  },

  async refreshDevices({ homey }: ApiArgs) {
    const refreshToken: string | null = homey.app.getRefreshToken();
    if (!refreshToken) {
      throw new Error("No refresh token stored - sign in again first");
    }
    const runId = runInBackground(homey, async (onProgress) => {
      onProgress("Refreshing your Home Connect session…");
      const token = await refreshAccessToken(refreshToken, homey.app.clientId);
      return ingestFromCloud(homey, token, onProgress);
    });
    return { runId };
  },

  async clearDevices({ homey }: ApiArgs) {
    await homey.app.setDevices([]);
    await homey.app.setRefreshToken(null);
    return { ok: true };
  },
};

async function ingestFromCloud(
  homey: any,
  token: TokenSet,
  onProgress: (message: string) => void,
): Promise<number> {
  const devices = await discoverAppliances(token, onProgress);
  await homey.app.setDevices(devices);
  if (token.refreshToken) {
    await homey.app.setRefreshToken(token.refreshToken);
  }
  return devices.length;
}

// Token exchange + discovery can outlast Homey's settings-API timeout.
function runInBackground(
  homey: any,
  work: (onProgress: (message: string) => void) => Promise<number>,
): string {
  const runId = randomUUID();
  const emit = (event: string, payload: Record<string, unknown>) => {
    Promise.resolve()
      .then(() => homey.api.realtime(event, { runId, ...payload }))
      .catch((err: unknown) => homey.app?.error?.(`realtime ${event} failed: ${err}`));
  };
  const onProgress = (message: string) => emit(EVENT_PROGRESS, { message });

  void (async () => {
    try {
      const deviceCount = await work(onProgress);
      emit(EVENT_DONE, { deviceCount });
    } catch (err) {
      emit(EVENT_ERROR, { message: (err as Error).message ?? String(err) });
    }
  })();

  return runId;
}

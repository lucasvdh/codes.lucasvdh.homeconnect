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

/**
 * App Web API - the thin HTTP layer between the settings page and the
 * one-time cloud key-exchange logic in lib/. It owns no logic of its own:
 * it wires the two ingestion flows (manual hcauth:// paste-back and
 * devices.json import) to lib/, persists the result via homey.app, and
 * streams progress back to the settings page over realtime events.
 *
 * Note: automating the SingleKey login (rendering/proxying it) is not
 * possible - the login page is an hCaptcha-gated SPA and hCaptcha is
 * host-locked to singlekey-id.com. So the user signs in in their own
 * browser and pastes the hcauth:// redirect URL back; see startManualAuth /
 * submitRedirectUrl.
 *
 * Token exchange + discovery can take longer than Homey's settings-API
 * timeout, so those run in the background (see runInBackground) and report
 * completion over the realtime channel, keyed by a runId.
 */

const EVENT_PROGRESS = "homeconnect:run:progress";
const EVENT_DONE = "homeconnect:run:done";
const EVENT_ERROR = "homeconnect:run:error";

interface ApiArgs {
  homey: any;
}

interface BodyArgs<T> extends ApiArgs {
  body: T;
}

/**
 * In-memory, per-login PKCE state, keyed by the pkceId handed to the
 * settings page. Lost on app restart - acceptable, since the flow completes
 * in minutes and the user can simply generate a new login link.
 */
const manualSessions = new Map<string, PkcePair>();

module.exports = {
  /** Current stored state, for the settings page to render on load. */
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
      })),
    };
  },

  // --- Manual flow: user logs in their own browser, pastes the URL back ----

  /** Generate the authorize URL for the user to open in their own browser. */
  async startManualAuth({ homey }: ApiArgs) {
    const pkce = createPkce();
    const pkceId = randomUUID();
    manualSessions.set(pkceId, pkce);
    return {
      pkceId,
      authorizeUrl: buildAuthorizeUrl(pkce, homey.app.clientId),
    };
  },

  /** Accept the pasted hcauth:// redirect URL and run the key-exchange. */
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

  // --- Import flow: paste/upload a ready-made devices.json -----------------

  /** Validate and store a devices.json verbatim. No cloud calls. */
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

  // --- Refresh: re-run discovery with the stored refresh token -------------

  /** Re-fetch the appliance list using the stored refresh token. */
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

  /** Forget all stored appliances and the refresh token. */
  async clearDevices({ homey }: ApiArgs) {
    await homey.app.setDevices([]);
    await homey.app.setRefreshToken(null);
    return { ok: true };
  },
};

/**
 * Shared tail of every cloud flow: run discovery, persist the appliances and
 * the refresh token. Returns the appliance count for the completion event.
 */
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

/**
 * Run slow work off the request/response cycle. Returns a runId immediately;
 * progress streams over EVENT_PROGRESS and the outcome over EVENT_DONE /
 * EVENT_ERROR, all keyed by that runId. Mirrors the pattern in the
 * philips-jointspace app.
 */
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

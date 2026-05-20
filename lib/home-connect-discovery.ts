"use strict";

import { DeviceConfig } from "./types";
import { TokenSet, jwtSubject } from "./home-connect-oauth";
import { parseIddfZip } from "./iddf";

/**
 * Cloud discovery - the second half of the one-time key-exchange. Given an
 * access token it fetches the account's paired appliances, their per-device
 * local PSK/AES keys, and the IDDF feature map, and returns the canonical
 * DeviceConfig[] the rest of the app runs on. After this completes the
 * appliances can be cut off from the internet entirely.
 *
 * Endpoints mirror hcpy's hc-login.py:
 *   GET {asset}/api/account/v2/accounts/{sub}/paired-appliances
 *   GET {asset}/api/appliance/v2/appliances/{haId}/encryption-information
 *   GET {asset}/api/iddf/v1/iddf/{haId}                     -> IDDF ZIP
 *
 * The account lives in one geo; we try EU then NA and keep whichever answers.
 */

const ASSET_URLS = [
  "https://eu.services.home-connect.com",
  "https://na.services.home-connect.com",
];

interface PairedAppliance {
  haId: string;
  haType: string;
  brand: string;
}

interface EncryptionInformation {
  tls?: { key: string };
  aes?: { key: string; iv: string };
}

/** Progress callback so the settings page can show what's happening. */
export type DiscoveryProgress = (message: string) => void;

export async function discoverAppliances(
  token: TokenSet,
  onProgress: DiscoveryProgress = () => {},
): Promise<DeviceConfig[]> {
  const subject = jwtSubject(token.accessToken);
  const authHeader = { Authorization: `Bearer ${token.accessToken}` };

  // Find the geo that hosts this account.
  onProgress("Looking up your Home Connect account…");
  let assetBase = "";
  let appliances: PairedAppliance[] = [];
  for (const base of ASSET_URLS) {
    const res = await fetch(`${base}/api/account/v2/accounts/${subject}/paired-appliances`, {
      headers: authHeader,
    });
    if (res.ok) {
      assetBase = base;
      appliances = ((await res.json()) as { appliances?: PairedAppliance[] }).appliances ?? [];
      break;
    }
  }
  if (!assetBase) {
    throw new Error("Could not reach your Home Connect account in either the EU or US region");
  }
  if (appliances.length === 0) {
    throw new Error("No appliances are paired to this Home Connect account");
  }

  const configs: DeviceConfig[] = [];
  for (const appliance of appliances) {
    onProgress(`Fetching keys for ${appliance.brand} ${appliance.haType}…`);

    const encryption = await getJson<EncryptionInformation>(
      `${assetBase}/api/appliance/v2/appliances/${appliance.haId}/encryption-information`,
      authHeader,
    );

    const tls = encryption.tls;
    const aes = encryption.aes;
    if (!tls && !aes) {
      throw new Error(`${appliance.haId}: no encryption information returned`);
    }

    onProgress(`Fetching feature map for ${appliance.brand} ${appliance.haType}…`);
    const iddfRes = await fetch(`${assetBase}/api/iddf/v1/iddf/${appliance.haId}`, {
      headers: authHeader,
    });
    if (!iddfRes.ok) {
      throw new Error(
        `${appliance.haId}: IDDF download failed (${iddfRes.status} ${iddfRes.statusText})`,
      );
    }
    const iddf = parseIddfZip(new Uint8Array(await iddfRes.arrayBuffer()));

    const cfg: DeviceConfig = {
      name: appliance.haType.toLowerCase(),
      haId: appliance.haId,
      host: tls ? `${appliance.brand}-${appliance.haType}-${appliance.haId}` : appliance.haId,
      key: (tls?.key ?? aes?.key) as string,
      ...(tls ? {} : { iv: aes!.iv }),
      description: iddf.description,
      features: iddf.features,
    };
    configs.push(cfg);
  }

  return configs;
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

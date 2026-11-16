"use strict";

import net from "net";

import { DeviceConfig } from "./types";

/**
 * Validation + normalization for DeviceConfig, shared by every ingestion
 * path: cloud discovery, the manual hcauth:// paste-back, and the raw
 * devices.json import. All three must converge on the exact same stored
 * shape, with `haId` guaranteed present so it can serve as the immutable
 * Homey device id.
 */

/**
 * Derive a stable appliance id from a config. Cloud discovery already knows
 * the haId; an imported hcpy devices.json does not, so we recover it from
 * the host - which is either "BRAND-Type-<serial>" (TLS) or the bare serial
 * (AES). The trailing digit run is the serial number.
 */
export function deriveHaId(cfg: DeviceConfig): string {
  if (cfg.haId) return cfg.haId;
  const match = cfg.host.match(/(\d{6,})\s*$/);
  return match ? match[1] : cfg.host;
}

/**
 * Validate a single raw entry (e.g. from a pasted devices.json) and return a
 * normalized DeviceConfig. Throws with a human-readable message on anything
 * structurally wrong, since this runs on user-supplied input.
 */
export function normalizeDeviceConfig(raw: unknown, index = 0): DeviceConfig {
  const where = `appliance #${index + 1}`;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${where}: expected an object`);
  }
  const o = raw as Record<string, unknown>;

  const requireString = (key: string): string => {
    const value = o[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${where}: missing or empty "${key}"`);
    }
    return value;
  };

  const name = requireString("name");
  const host = requireString("host");
  const key = requireString("key");
  const iv = typeof o.iv === "string" && o.iv.length > 0 ? o.iv : undefined;

  if (typeof o.description !== "object" || o.description === null) {
    throw new Error(`${where}: missing "description" block`);
  }
  if (typeof o.features !== "object" || o.features === null) {
    throw new Error(`${where}: missing "features" map`);
  }

  const cfg: DeviceConfig = {
    name,
    host,
    key,
    ...(iv ? { iv } : {}),
    description: o.description as DeviceConfig["description"],
    features: o.features as DeviceConfig["features"],
  };
  cfg.haId = deriveHaId(cfg);
  return cfg;
}

/** Validate + normalize a whole devices.json array. */
export function normalizeDeviceConfigs(raw: unknown): DeviceConfig[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected a JSON array of appliances");
  }
  if (raw.length === 0) {
    throw new Error("The devices list is empty");
  }
  return raw.map((entry, index) => normalizeDeviceConfig(entry, index));
}

/** True when the app's config for an appliance differs in anything that matters to the connection. */
export function configChanged(stored: DeviceConfig, next: DeviceConfig): boolean {
  return (
    stored.key !== next.key ||
    stored.iv !== next.iv ||
    stored.description?.version !== next.description?.version ||
    stored.description?.revision !== next.description?.revision ||
    JSON.stringify(stored.features ?? {}) !== JSON.stringify(next.features ?? {})
  );
}

/**
 * Combine the config a device stored with the app's current one (the source
 * of truth after a re-login or import) on device init.
 *
 * - No stored keys yet (first init after pairing): take the app's config.
 * - Migration from <= 1.4.2: mDNS pinning used to overwrite `host` with an
 *   IPv4 address, losing the name. When the stored host is an IP and the app
 *   still knows a hostname, restore the name and keep the IP as `address`.
 * - App config changed (new keys / feature map): take it, keep `address`.
 */
export function mergeStoredConfig(
  stored: DeviceConfig | undefined,
  fromApp: DeviceConfig | undefined,
): { config: DeviceConfig | undefined; changed: boolean } {
  if (!stored?.key) {
    return fromApp?.key ? { config: { ...fromApp }, changed: true } : { config: stored, changed: false };
  }
  let config: DeviceConfig = { ...stored };
  let changed = false;
  if (net.isIP(config.host) && fromApp?.host && !net.isIP(fromApp.host)) {
    config = { ...config, host: fromApp.host, address: config.address ?? config.host };
    changed = true;
  }
  if (fromApp?.key && configChanged(config, fromApp)) {
    config = { ...fromApp, ...(config.address ? { address: config.address } : {}) };
    changed = true;
  }
  return { config, changed };
}

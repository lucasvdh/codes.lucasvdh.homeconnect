"use strict";

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

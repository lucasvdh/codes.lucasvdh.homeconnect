"use strict";

import net from "net";

import { DeviceConfig } from "./types";


// An imported devices.json has no haId: it is the trailing digits of "BRAND-Type-<serial>" or the
// bare serial.
export function deriveHaId(cfg: DeviceConfig): string {
  if (cfg.haId) return cfg.haId;
  const match = cfg.host.match(/(\d{6,})\s*$/);
  return match ? match[1] : cfg.host;
}

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

export function normalizeDeviceConfigs(raw: unknown): DeviceConfig[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected a JSON array of appliances");
  }
  if (raw.length === 0) {
    throw new Error("The devices list is empty");
  }
  return raw.map((entry, index) => normalizeDeviceConfig(entry, index));
}

export function configChanged(stored: DeviceConfig, next: DeviceConfig): boolean {
  return (
    stored.key !== next.key ||
    stored.iv !== next.iv ||
    stored.description?.version !== next.description?.version ||
    stored.description?.revision !== next.description?.revision ||
    JSON.stringify(stored.features ?? {}) !== JSON.stringify(next.features ?? {})
  );
}

// Migration from <= 1.4.2: mDNS pinning overwrote `host` with an IP; restore the name and keep the
// IP as `address`.
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

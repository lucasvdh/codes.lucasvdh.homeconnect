"use strict";

import Homey from "homey";

import net from "net";

import { DeviceConfig } from "./lib/types";
import { ConnectionStatusStore } from "./lib/connection-status";
import { MdnsResultLike, describeMdnsResult, matchMdnsResult } from "./lib/mdns-match";

const SETTINGS_DEVICES = "devices";
const SETTINGS_REFRESH_TOKEN = "refreshToken";
const MDNS_STRATEGY = "homeconnect-mdns";

type MdnsResult = MdnsResultLike & { address?: string; lastSeen?: Date | string };

class HomeConnectApp extends Homey.App {
  readonly connectionStatus = new ConnectionStatusStore();
  // So periodic re-announcements don't flood the log.
  private readonly loggedMdns = new Set<string>();

  async onInit(): Promise<void> {
    this.log("Home Connect (Local) app is running...");
    this.watchMdns();
  }

  // When an appliance stays unavailable, this log shows whether Homey sees it at all.
  private watchMdns(): void {
    let strategy: Homey.DiscoveryStrategy;
    try {
      strategy = this.homey.discovery.getStrategy(MDNS_STRATEGY);
    } catch (err) {
      this.error(`[mdns] strategy unavailable: ${(err as Error).message}`);
      return;
    }
    const results = Object.values(strategy.getDiscoveryResults() ?? {}) as MdnsResult[];
    this.log(`[mdns] ${results.length} result(s) at start`);
    for (const result of results) this.onMdnsResult(result);
    strategy.on("result", (result: MdnsResult) => this.onMdnsResult(result));
    strategy.on("addressChanged", (result: MdnsResult) => this.onMdnsResult(result));
  }

  private onMdnsResult(result: MdnsResult): void {
    const key = `${String(result.id)}|${String(result.address)}`;
    const firstSighting = !this.loggedMdns.has(key);
    this.loggedMdns.add(key);
    const devices = this.getDevices();
    const matches = devices
      .map((cfg) => ({ haId: cfg.haId ?? "", match: matchMdnsResult(result, cfg.haId) }))
      .filter((m) => m.match.matched);
    for (const m of matches) {
      this.connectionStatus.recordMdns(m.haId, result.address, m.match.via);
    }
    if (!firstSighting) return;
    if (matches.length > 0) {
      const which = matches.map((m) => `${m.haId} via ${m.match.via}`).join(", ");
      this.log(`[mdns] ${describeMdnsResult(result)} -> matches ${which}`);
    } else {
      const known = devices.map((cfg) => cfg.haId).join(", ") || "none";
      this.log(`[mdns] ${describeMdnsResult(result)} -> no stored appliance matches (stored: ${known})`);
    }
  }

  // So a device doesn't depend on .local resolution or on getting the discovery event itself.
  findMdnsAddress(haId: string): { address: string; via?: string } | null {
    let results: MdnsResult[];
    try {
      results = Object.values(
        this.homey.discovery.getStrategy(MDNS_STRATEGY).getDiscoveryResults() ?? {},
      ) as MdnsResult[];
    } catch {
      return null;
    }
    const seenAt = (r: MdnsResult): number => (r.lastSeen ? new Date(r.lastSeen).getTime() || 0 : 0);
    const best = results
      .map((r) => ({ r, match: matchMdnsResult(r, haId) }))
      .filter(({ r, match }) => match.matched && typeof r.address === "string" && net.isIPv4(r.address))
      .sort((a, b) => seenAt(b.r) - seenAt(a.r))[0];
    return best ? { address: best.r.address as string, via: best.match.via } : null;
  }

  get clientId(): string {
    const id = Homey.env.HOMECONNECT_CLIENT_ID;
    if (!id) throw new Error("HOMECONNECT_CLIENT_ID is not set in env.json");
    return id;
  }

  getDevices(): DeviceConfig[] {
    return (this.homey.settings.get(SETTINGS_DEVICES) as DeviceConfig[] | null) ?? [];
  }

  async setDevices(devices: DeviceConfig[]): Promise<void> {
    await this.homey.settings.set(SETTINGS_DEVICES, devices);
    this.log(`stored ${devices.length} appliance config(s)`);
  }

  getDevice(haId: string): DeviceConfig | undefined {
    return this.getDevices().find((d) => d.haId === haId);
  }

  getRefreshToken(): string | null {
    return (this.homey.settings.get(SETTINGS_REFRESH_TOKEN) as string | null) ?? null;
  }

  async setRefreshToken(token: string | null): Promise<void> {
    await this.homey.settings.set(SETTINGS_REFRESH_TOKEN, token);
  }
}

module.exports = HomeConnectApp;

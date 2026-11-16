"use strict";

import Homey from "homey";

import net from "net";

import { DeviceConfig } from "./lib/types";
import { ConnectionStatusStore } from "./lib/connection-status";
import { MdnsResultLike, describeMdnsResult, matchMdnsResult } from "./lib/mdns-match";

/** homey.settings keys owned by the app. */
const SETTINGS_DEVICES = "devices";
const SETTINGS_REFRESH_TOKEN = "refreshToken";
/** Discovery strategy id, see .homeycompose/discovery/homeconnect-mdns.json. */
const MDNS_STRATEGY = "homeconnect-mdns";

type MdnsResult = MdnsResultLike & { address?: string; lastSeen?: Date | string };

/**
 * The app instance owns all persistent cross-flow state: the discovered
 * appliance list and the OAuth refresh token. The settings page (via api.ts)
 * writes it during the one-time key-exchange; the driver reads the device
 * list when pairing. Keeping this here - rather than in the driver or the
 * settings page - means there is exactly one source of truth and one place
 * that touches homey.settings.
 */
class HomeConnectApp extends Homey.App {
  /** Per-appliance connection state for the settings page. */
  readonly connectionStatus = new ConnectionStatusStore();
  /** "id|address" pairs already logged, so periodic re-announcements don't flood the log. */
  private readonly loggedMdns = new Set<string>();

  async onInit(): Promise<void> {
    this.log("Home Connect (Local) app is running...");
    this.watchMdns();
  }

  /**
   * Log every `_homeconnect._tcp` announcement once, with whether it matches
   * a stored appliance and how. When an appliance stays unavailable, this is
   * what tells us if Homey sees it on the network at all.
   */
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

  /**
   * The freshest IPv4 address mDNS currently reports for an appliance, used
   * when connecting so a device doesn't depend on .local name resolution or
   * on having received the discovery event itself.
   */
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

  /** The hcpy/BSH OAuth client_id, kept in env.json (see env.example.json). */
  get clientId(): string {
    const id = Homey.env.HOMECONNECT_CLIENT_ID;
    if (!id) throw new Error("HOMECONNECT_CLIENT_ID is not set in env.json");
    return id;
  }

  /** The appliances discovered/imported during the key-exchange. */
  getDevices(): DeviceConfig[] {
    return (this.homey.settings.get(SETTINGS_DEVICES) as DeviceConfig[] | null) ?? [];
  }

  /** Replace the stored appliance list (called by every ingestion flow). */
  async setDevices(devices: DeviceConfig[]): Promise<void> {
    await this.homey.settings.set(SETTINGS_DEVICES, devices);
    this.log(`stored ${devices.length} appliance config(s)`);
  }

  /** The single config for one appliance, looked up by its stable haId. */
  getDevice(haId: string): DeviceConfig | undefined {
    return this.getDevices().find((d) => d.haId === haId);
  }

  /** Refresh token kept so the settings page can re-run discovery later. */
  getRefreshToken(): string | null {
    return (this.homey.settings.get(SETTINGS_REFRESH_TOKEN) as string | null) ?? null;
  }

  async setRefreshToken(token: string | null): Promise<void> {
    await this.homey.settings.set(SETTINGS_REFRESH_TOKEN, token);
  }
}

module.exports = HomeConnectApp;

"use strict";

import Homey from "homey";

import { DeviceConfig } from "./lib/types";

/** homey.settings keys owned by the app. */
const SETTINGS_DEVICES = "devices";
const SETTINGS_REFRESH_TOKEN = "refreshToken";

/**
 * The app instance owns all persistent cross-flow state: the discovered
 * appliance list and the OAuth refresh token. The settings page (via api.ts)
 * writes it during the one-time key-exchange; the driver reads the device
 * list when pairing. Keeping this here - rather than in the driver or the
 * settings page - means there is exactly one source of truth and one place
 * that touches homey.settings.
 */
class HomeConnectApp extends Homey.App {
  async onInit(): Promise<void> {
    this.log("Home Connect (Local) app is running...");
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

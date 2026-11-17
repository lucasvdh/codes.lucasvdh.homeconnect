"use strict";

import { ConnectionReason } from "./connection-errors";

export type ConnectionState = "connecting" | "connected" | "unavailable";

// In memory only: every device reports again on start.
export interface ConnectionStatus {
  state?: ConnectionState;
  reason?: ConnectionReason;
  /** e.g. "192.168.1.20: ECONNREFUSED" or "close 1008 Header Error" */
  detail?: string;
  address?: string;
  /** Epoch ms. */
  since?: number;
  mdns?: { address?: string; at: number; via?: string };
}

export class ConnectionStatusStore {
  private readonly statuses = new Map<string, ConnectionStatus>();

  constructor(private readonly now: () => number = Date.now) {}

  get(haId: string): ConnectionStatus {
    return { ...(this.statuses.get(haId) ?? {}) };
  }

  // A new state clears the previous reason unless one is given.
  setState(
    haId: string,
    state: ConnectionState,
    extra: { reason?: ConnectionReason; detail?: string; address?: string } = {},
  ): void {
    const current = this.statuses.get(haId) ?? {};
    const next: ConnectionStatus = {
      ...current,
      state,
      reason: state === "unavailable" ? extra.reason : undefined,
      detail: state === "unavailable" ? extra.detail : undefined,
      since: current.state === state ? current.since ?? this.now() : this.now(),
    };
    if (extra.address) next.address = extra.address;
    this.statuses.set(haId, next);
  }

  recordMdns(haId: string, address: string | undefined, via?: string): void {
    const current = this.statuses.get(haId) ?? {};
    this.statuses.set(haId, { ...current, mdns: { address, via, at: this.now() } });
  }

  forget(haId: string): void {
    this.statuses.delete(haId);
  }
}

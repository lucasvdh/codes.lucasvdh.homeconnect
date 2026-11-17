"use strict";

import dns from "dns/promises";
import net from "net";

import { ConnectionError } from "./connection-errors";

const LOOKUP_TIMEOUT_MS = 5_000;

export type LookupFn = (name: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (name) => dns.lookup(name, { all: true });

export interface ResolveOptions {
  lookup?: LookupFn;
  timeoutMs?: number;
  log?: (line: string) => void;
}

// The bare hcpy name only resolves if the router registers DHCP names in DNS,
// so `.local` first (#8).
export function hostCandidates(host: string): string[] {
  const h = host.trim().replace(/\.$/, "");
  if (net.isIP(h) || h.includes(".")) return [h];
  return [`${h}.local`, h];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// IPv6 only as a fallback: a name can resolve to a v6 address the appliance doesn't listen on.
export async function resolveAddresses(host: string, opts: ResolveOptions = {}): Promise<string[]> {
  const lookup = opts.lookup ?? defaultLookup;
  const timeoutMs = opts.timeoutMs ?? LOOKUP_TIMEOUT_MS;
  const log = opts.log ?? (() => {});
  const trimmed = host.trim();
  if (net.isIP(trimmed)) return [trimmed];

  const errors: string[] = [];
  for (const name of hostCandidates(trimmed)) {
    try {
      const results = await withTimeout(lookup(name), timeoutMs, `lookup ${name}`);
      const addresses = [...results]
        .sort((a, b) => a.family - b.family)
        .map((r) => r.address)
        .filter((address, i, all) => all.indexOf(address) === i);
      if (addresses.length > 0) {
        log(`resolve ${name}: ${addresses.join(", ")}`);
        return addresses;
      }
      log(`resolve ${name}: no addresses`);
      errors.push(`${name}: no addresses`);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const why = e.code ?? (/timed out/.test(e.message) ? "timeout" : e.message);
      log(`resolve ${name}: ${why}`);
      errors.push(`${name}: ${why}`);
    }
  }
  throw new ConnectionError(
    "resolve_failed",
    `Could not resolve ${trimmed} (${errors.join("; ")})`,
    errors.join("; "),
  );
}

export function urlHost(address: string): string {
  return net.isIPv6(address) ? `[${address}]` : address;
}

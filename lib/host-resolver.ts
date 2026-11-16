"use strict";

import dns from "dns/promises";
import net from "net";

import { ConnectionError } from "./connection-errors";

const LOOKUP_TIMEOUT_MS = 5_000;

/** dns.lookup(name, { all: true }), injectable for tests. */
export type LookupFn = (name: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (name) => dns.lookup(name, { all: true });

export interface ResolveOptions {
  lookup?: LookupFn;
  timeoutMs?: number;
  /** Receives one line per attempt, for the app log. */
  log?: (line: string) => void;
}

/**
 * Hostnames to try for an appliance, most likely first.
 *
 * hcpy stores the bare mDNS name ("BOSCH-Oven-3841..."), which only resolves
 * when the router happens to register DHCP hostnames in DNS. The appliances
 * always announce themselves over mDNS, so for a bare name we try the
 * `.local` variant first and fall back to the name as given. IPs and names
 * that already carry a domain are used verbatim.
 */
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

/**
 * Resolve an appliance host to the addresses worth connecting to, IPv4
 * first. On networks with IPv6 enabled a name can also resolve to an IPv6
 * address the appliance doesn't actually listen on, so v6 is only a fallback.
 * Throws a ConnectionError("resolve_failed") listing every attempt.
 */
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

/** Format an address for use in a URL authority (brackets around IPv6). */
export function urlHost(address: string): string {
  return net.isIPv6(address) ? `[${address}]` : address;
}

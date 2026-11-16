"use strict";

/**
 * Matching mDNS discovery results (`_homeconnect._tcp`) to a stored
 * appliance. The appliances announce an instance name like
 * "BOSCH-Dishwasher-012345678901234567" (TLS) or the bare id (AES), but the
 * exact prefix isn't guaranteed: some models may use the model number
 * instead of the type, or put the id only in a TXT record. So we compare
 * dash/dot-separated tokens rather than the whole string, and look at every
 * field the result carries.
 */

export interface MdnsResultLike {
  id?: unknown;
  name?: unknown;
  fullname?: unknown;
  host?: unknown;
  address?: unknown;
  txt?: unknown;
}

export interface MdnsMatch {
  matched: boolean;
  /** Which field matched, e.g. "name" or "txt.haid". */
  via?: string;
}

/** Strip mDNS suffixes and lowercase: "BOSCH-Oven-123.local." -> "bosch-oven-123". */
export function normalizeMdnsName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\._homeconnect\._tcp\.local\.?$/, "")
    .replace(/\.local\.?$/, "")
    .replace(/\.$/, "");
}

/** The string fields of a result worth comparing, labelled for the log. */
export function candidateFields(result: MdnsResultLike): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  for (const key of ["id", "name", "fullname", "host"] as const) {
    const v = result[key];
    if (typeof v === "string" && v.trim()) fields.push([key, v]);
  }
  if (result.txt && typeof result.txt === "object") {
    for (const [key, v] of Object.entries(result.txt as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) fields.push([`txt.${key}`, v]);
    }
  }
  return fields;
}

/**
 * Does this mDNS result belong to the appliance with this haId? True when a
 * field equals the haId, or contains it as a whole token, so
 * "BOSCH-Dishwasher-<haId>", "SIEMENS-SN85TX00CE-<haId>" and "<haId>.local"
 * all match while "<haId>9" does not.
 */
export function matchMdnsResult(result: MdnsResultLike, haId: string | undefined): MdnsMatch {
  const id = (haId ?? "").trim().toLowerCase();
  if (!id) return { matched: false };
  for (const [label, raw] of candidateFields(result)) {
    const value = normalizeMdnsName(raw);
    if (value === id) return { matched: true, via: label };
    if (value.split(/[-_.\s]+/).includes(id)) return { matched: true, via: label };
    // A haId can itself contain dashes ("BOSCH-HBG634BS1-68A40E..."):
    // then it must appear as a whole dash-delimited run.
    if (id.includes("-") && `-${value}-`.includes(`-${id}-`)) return { matched: true, via: label };
  }
  return { matched: false };
}

/** One-line summary of a result for the log; never includes keys. */
export function describeMdnsResult(result: MdnsResultLike): string {
  const parts = candidateFields(result).map(([k, v]) => `${k}=${v}`);
  if (typeof result.address === "string") parts.push(`address=${result.address}`);
  return parts.join(" ");
}

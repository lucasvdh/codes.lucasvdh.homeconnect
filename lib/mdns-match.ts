"use strict";

// The prefix of the instance name isn't fixed (some models use the model number, or put the id only
// in a TXT record), so tokens of every field are compared.

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

/** "BOSCH-Oven-123.local." -> "bosch-oven-123" */
export function normalizeMdnsName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\._homeconnect\._tcp\.local\.?$/, "")
    .replace(/\.local\.?$/, "")
    .replace(/\.$/, "");
}

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

export function describeMdnsResult(result: MdnsResultLike): string {
  const parts = candidateFields(result).map(([k, v]) => `${k}=${v}`);
  if (typeof result.address === "string") parts.push(`address=${result.address}`);
  return parts.join(" ");
}

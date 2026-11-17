"use strict";

/** One entry of hcpy's devices.json, from the cloud key exchange or imported as-is. */
export interface DeviceConfig {
  /** Lowercased appliance type, e.g. "oven". */
  name: string;
  /** "BOSCH-Oven-384100532686002417" (TLS) or the bare haId (AES). */
  host: string;
  /** Last known IPv4. Kept next to `host` so a stale address falls back to the name. */
  address?: string;
  /** Base64url. The TLS PSK (port 443), or the source of the AES enc/mac keys (port 80). */
  key: string;
  /** Only present on HTTP/AES appliances; that is how the variant is told apart. */
  iv?: string;
  description: DeviceDescription;
  /** UID -> descriptor */
  features: Record<string, FeatureDescriptor>;
  /** Not in hcpy's devices.json; normalizeDeviceConfig() fills it in. */
  haId?: string;
}

export interface DeviceDescription {
  type: string;
  brand: string;
  model: string;
  version: string;
  revision: string;
}

// Attributes are copied verbatim from the IDDF XML, so numbers arrive as strings.
export interface FeatureDescriptor {
  name: string;
  /** "read" | "readWrite" | "writeOnly" | "none" (casing as in the XML). */
  access?: string;
  available?: string;
  refCID?: string;
  refDID?: string;
  /** value -> member name */
  values?: Record<string, string>;
  min?: string;
  max?: string;
  [attr: string]: unknown;
}

export interface HomeConnectValue {
  uid: number;
  value: unknown;
}

export interface HomeConnectMessage {
  sID: number;
  msgID: number;
  resource: string;
  version: number;
  action: "GET" | "POST" | "RESPONSE" | "NOTIFY" | "ERROR";
  data?: unknown[];
  code?: number;
}

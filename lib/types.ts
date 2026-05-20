"use strict";

/**
 * One appliance entry in the canonical hcpy `devices.json` shape. This is the
 * single source of truth the app runs on - produced by the cloud
 * key-exchange (lib/home-connect-discovery.ts) or imported verbatim from an
 * hcpy-generated devices.json. After ingestion the app talks to the
 * appliance fully locally; no cloud is needed again.
 */
export interface DeviceConfig {
  /** hcpy uses the lowercased appliance type, e.g. "oven", "dishwasher". */
  name: string;
  /**
   * mDNS / DNS hostname, e.g. "BOSCH-Oven-384100532686002417" (TLS variant)
   * or the bare haId (AES variant). Resolvable on the local network.
   * device.ts may swap this for a raw IP when mDNS reports an address change.
   */
  host: string;
  /**
   * Base64url-encoded pre-shared key.
   * - TLS-PSK appliances (no `iv`): used as the TLS PSK (port 443, wss).
   * - HTTP/AES appliances (`iv` present): used to derive enc/mac keys (port 80).
   */
  key: string;
  /** Base64url IV. Present ONLY for the HTTP/AES variant - its presence is the discriminator. */
  iv?: string;
  /** Appliance identity, from the IDDF DeviceDescription.xml. */
  description: DeviceDescription;
  /** UID -> feature descriptor, from the IDDF FeatureMapping + DeviceDescription. */
  features: Record<string, FeatureDescriptor>;
  /**
   * Stable, immutable appliance id (serial / haId). Not part of hcpy's
   * devices.json - filled in by normalizeDeviceConfig() so it is always
   * present on a stored config. Used as the Homey device `data.id`.
   */
  haId?: string;
}

export interface DeviceDescription {
  /** "Oven", "Dishwasher", "Washer", ... */
  type: string;
  /** "BOSCH", "SIEMENS", ... */
  brand: string;
  /** VIB / model number, e.g. "HBG976MB1". */
  model: string;
  /** IDDF version. */
  version: string;
  /** IDDF revision. */
  revision: string;
}

/**
 * One feature (UID) of an appliance. The shape mirrors hcpy: attributes from
 * the IDDF XML are copied verbatim, so numeric-looking values are strings.
 */
export interface FeatureDescriptor {
  /** Dotted name, e.g. "BSH.Common.Setting.PowerState". */
  name: string;
  /** "read" | "readWrite" | "writeOnly" | "none" (casing as in the XML). */
  access?: string;
  /** "true" | "false" - a string, as it comes from the XML. */
  available?: string;
  refCID?: string;
  refDID?: string;
  /** For enum-typed features: numeric value (as string) -> member name. */
  values?: Record<string, string>;
  /** Numeric range for scalar features (strings, as in the XML). */
  min?: string;
  max?: string;
  /** Any other attribute copied verbatim from the IDDF XML. */
  [attr: string]: unknown;
}

/** A single value as sent/received over the local websocket. */
export interface HomeConnectValue {
  uid: number;
  value: unknown;
}

/** Envelope of the JSON protocol spoken over the local websocket. */
export interface HomeConnectMessage {
  sID: number;
  msgID: number;
  resource: string;
  version: number;
  action: "GET" | "POST" | "RESPONSE" | "NOTIFY" | "ERROR";
  data?: unknown[];
  code?: number;
}

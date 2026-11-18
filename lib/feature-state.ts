import { FeatureDescriptor } from "./types";

// Description changes carry JSON booleans; the IDDF carries strings.
export function isFeatureAvailable(feature: FeatureDescriptor): boolean {
  const available = feature.available as unknown;
  return !(
    available === false ||
    available === 0 ||
    String(available).toLowerCase() === "false" ||
    String(available) === "0"
  );
}

export function isFeatureWritableNow(feature?: FeatureDescriptor): boolean {
  if (!feature || !isFeatureAvailable(feature)) return false;
  const access = typeof feature.access === "string" ? feature.access.toLowerCase() : "";
  return access === "" || access.includes("write");
}

export function describeFeatureState(feature?: FeatureDescriptor): string {
  if (!feature) return "unknown";
  return `access=${String(feature.access ?? "-")} available=${String(feature.available ?? "-")}`;
}

import { FeatureDescriptor } from "./types";

export function isFeatureWritableNow(feature?: FeatureDescriptor): boolean {
  if (!feature) return false;
  const available = feature.available as unknown;
  if (
    available === false ||
    available === 0 ||
    String(available).toLowerCase() === "false" ||
    String(available) === "0"
  ) {
    return false;
  }
  const access = typeof feature.access === "string" ? feature.access.toLowerCase() : "";
  return access === "" || access.includes("write");
}

export function describeFeatureState(feature?: FeatureDescriptor): string {
  if (!feature) return "unknown";
  return `access=${String(feature.access ?? "-")} available=${String(feature.available ?? "-")}`;
}

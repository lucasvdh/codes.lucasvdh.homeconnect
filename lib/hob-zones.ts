import { isFeatureAvailable } from "./feature-state";
import { FeatureDescriptor } from "./types";

type Title = { en: string; nl: string; de: string };

const ZONE_FEATURE = /^Cooking\.Hob\.Status\.Zone\.(\d+)\.(\w+)$/;
const ZONE_LIST = /^Cooking\.Hob\.StatusList\.Zone\.(\d+)$/;
const POWER_STATE = "BSH.Common.Setting.PowerState";

// Members of Cooking.Hob.EnumType.ZoneSelector; HOB_ZONES in tools/generate-drivers.mjs must match.
export const ZONE_TITLES: Record<string, Title> = {
  "100": { en: "Front left", nl: "Linksvoor", de: "Vorne links" },
  "120": { en: "Left", nl: "Links", de: "Links" },
  "121": { en: "Left (extension)", nl: "Links (uitbreiding)", de: "Links (Erweiterung)" },
  "200": { en: "Rear left", nl: "Linksachter", de: "Hinten links" },
  "201": { en: "Rear left (extension)", nl: "Linksachter (uitbreiding)", de: "Hinten links (Erweiterung)" },
  "300": { en: "Rear right", nl: "Rechtsachter", de: "Hinten rechts" },
  "301": { en: "Rear right (extension)", nl: "Rechtsachter (uitbreiding)", de: "Hinten rechts (Erweiterung)" },
  "340": { en: "Right", nl: "Rechts", de: "Rechts" },
  "341": { en: "Right (extension)", nl: "Rechts (uitbreiding)", de: "Rechts (Erweiterung)" },
  "400": { en: "Front right", nl: "Rechtsvoor", de: "Vorne rechts" },
};

export function zoneTitle(zone: string): Title {
  return ZONE_TITLES[zone] ?? { en: `Zone ${zone}`, nl: `Zone ${zone}`, de: `Zone ${zone}` };
}

export function parseZoneFeature(name: string): { zone: string; key: string } | null {
  const match = ZONE_FEATURE.exec(name);
  return match ? { zone: match[1], key: match[2] } : null;
}

// Every hob describes all ten zones; the ones it physically has are the zone lists marked available.
export function availableZones(features: Record<string, FeatureDescriptor>): string[] {
  const listed: string[] = [];
  const withPower = new Set<string>();
  for (const feature of Object.values(features)) {
    const list = ZONE_LIST.exec(feature.name);
    if (list && isFeatureAvailable(feature)) listed.push(list[1]);
    const parsed = parseZoneFeature(feature.name);
    if (parsed?.key === "PowerLevel") withPower.add(parsed.zone);
  }
  // Older exports may lack the zone lists.
  const zones = listed.length > 0 ? listed : [...withPower];
  return zones.sort((a, b) => Number(a) - Number(b));
}

export interface ZoneReading {
  power?: string;
  state?: string;
}

// Returns the zones that changed.
export function applyZoneValues(
  readings: Map<string, ZoneReading>,
  values: Record<string, unknown>,
): string[] {
  const changed = new Set<string>();
  if (values[POWER_STATE] === "Off") {
    // A hob switched off at its main switch may not report every zone as Off.
    for (const [zone, reading] of readings) {
      if (reading.power !== "Off") changed.add(zone);
      reading.power = "Off";
    }
  }
  for (const [name, raw] of Object.entries(values)) {
    const parsed = parseZoneFeature(name);
    if (!parsed || typeof raw !== "string") continue;
    if (parsed.key !== "PowerLevel" && parsed.key !== "State") continue;
    const reading = readings.get(parsed.zone) ?? {};
    if (parsed.key === "PowerLevel") reading.power = raw;
    else reading.state = raw;
    readings.set(parsed.zone, reading);
    changed.add(parsed.zone);
  }
  return [...changed];
}

// Must match the values in homeconnect_hob_zone.json.
export function zoneDisplay(reading: ZoneReading): string {
  const power = reading.power ?? "Off";
  if (power !== "Off") return power;
  // "ResiduelHeat" is how the appliance spells it.
  return reading.state === "ResiduelHeat" ? "ResidualHeat" : "Off";
}

export function zoneIsOn(reading: ZoneReading): boolean {
  return reading.power != null && reading.power !== "Off";
}

// Joined flex zones have no tile but still count.
export function activeZoneCount(readings: Map<string, ZoneReading>): number {
  return [...readings.values()].filter(zoneIsOn).length;
}

export function cookingEdge(previous: number | null, active: number): "started" | "stopped" | null {
  if (previous == null) return null;
  if (previous === 0 && active > 0) return "started";
  if (previous > 0 && active === 0) return "stopped";
  return null;
}

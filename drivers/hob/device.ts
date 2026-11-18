"use strict";

import { ApplianceDevice } from "../../lib/appliance-device";
import {
  ZoneReading,
  activeZoneCount,
  applyZoneValues,
  availableZones,
  cookingEdge,
  zoneDisplay,
  zoneIsOn,
  zoneTitle,
} from "../../lib/hob-zones";
import { FeatureDescriptor } from "../../lib/types";

const ZONE_CAPABILITY = "homeconnect_hob_zone";
const ACTIVE_ZONES_CAPABILITY = "homeconnect_hob_active_zones";

type Language = "en" | "nl" | "de";
type EnumValue = { id: string; title: Record<string, string> };

// The zones themselves can't be controlled remotely.
class HobDevice extends ApplianceDevice {
  private readonly readings = new Map<string, ZoneReading>();
  // Kept in memory: concurrent value batches would both read the old capability value.
  private activeZones: number | null = null;

  isCooking(): boolean {
    return activeZoneCount(this.readings) > 0;
  }

  isZoneCooking(zone: string): boolean {
    const reading = this.readings.get(zone);
    return reading != null && zoneIsOn(reading);
  }

  protected async syncDriverCapabilities(features: Record<string, FeatureDescriptor>): Promise<void> {
    const zones = availableZones(features);
    const wanted = new Set(zones.map((zone) => `${ZONE_CAPABILITY}.${zone}`));
    for (const capability of this.getCapabilities()) {
      if (capability.startsWith(`${ZONE_CAPABILITY}.`) && !wanted.has(capability)) {
        await this.removeCapability(capability).catch(this.error);
      }
    }
    for (const zone of zones) {
      const capability = `${ZONE_CAPABILITY}.${zone}`;
      if (!this.hasCapability(capability)) await this.addCapability(capability).catch(this.error);
      await this.setCapabilityOptions(capability, { title: zoneTitle(zone) }).catch(this.error);
    }
    const stored = this.getCapabilityValue(ACTIVE_ZONES_CAPABILITY);
    this.activeZones = typeof stored === "number" ? stored : null;
    this.log(`[hob] zones ${zones.join(",") || "-"}`);
  }

  protected async onValuesApplied(values: Record<string, unknown>): Promise<void> {
    const changed = applyZoneValues(this.readings, values);
    if (changed.length === 0) return;
    await this.updateActiveZones();
    for (const zone of changed) await this.renderZone(zone);
  }

  private async updateActiveZones(): Promise<void> {
    const active = activeZoneCount(this.readings);
    const edge = cookingEdge(this.activeZones, active);
    if (active === this.activeZones) return;
    this.activeZones = active;
    await this.setCapabilityValue(ACTIVE_ZONES_CAPABILITY, active).catch(this.error);
    if (edge === "started") this.driverTrigger("cookingStarted")?.trigger(this, {}, {}).catch(this.error);
    if (edge === "stopped") this.driverTrigger("cookingStopped")?.trigger(this, {}, {}).catch(this.error);
  }

  private async renderZone(zone: string): Promise<void> {
    const capability = `${ZONE_CAPABILITY}.${zone}`;
    const reading = this.readings.get(zone);
    if (!reading || !this.hasCapability(capability)) return;
    const previous = this.getCapabilityValue(capability);
    const display = zoneDisplay(reading);
    if (display === previous) return;
    try {
      await this.setCapabilityValue(capability, display as never);
    } catch (err) {
      this.error(err);
      return;
    }
    if (previous == null) return;
    const language = this.language();
    this.driverTrigger("zoneChanged")
      ?.trigger(
        this,
        { zone: zoneTitle(zone)[language], level: this.displayTitle(display, language) },
        { zone },
      )
      .catch(this.error);
  }

  private displayTitle(display: string, language: Language): string {
    const capabilities = this.homey.manifest.capabilities as Record<string, { values?: EnumValue[] }>;
    const title = capabilities[ZONE_CAPABILITY]?.values?.find((v) => v.id === display)?.title;
    return title?.[language] ?? title?.en ?? display;
  }

  private language(): Language {
    const language = this.homey.i18n.getLanguage();
    return language === "nl" || language === "de" ? language : "en";
  }
}

module.exports = HobDevice;

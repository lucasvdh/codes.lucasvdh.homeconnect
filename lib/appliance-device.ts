"use strict";

import Homey from "homey";

import { DeviceConfig, FeatureDescriptor } from "./types";
import { HomeConnectClient } from "./home-connect-client";

/** Reconnect backoff after an unexpected websocket close. */
const RECONNECT_DELAY_MS = 15_000;

/** Operation states in which the appliance actively pushes progress updates. */
const RUNNING_STATES = new Set(["Run", "DelayedStart", "Pause", "ActionRequired"]);

/** Decode a value coming from the appliance into a Homey capability value. */
type Decoder = (v: unknown, feature?: FeatureDescriptor) => unknown;
/** Encode a Homey capability value into the wire form the appliance expects. */
type Encoder = (v: unknown, feature?: FeatureDescriptor) => unknown;

interface CapabilityMapEntry {
  capability: string;
  decode: Decoder;
  /** Only present for writable capabilities. */
  encode?: Encoder;
}

// --- decode/encode helpers ---------------------------------------------------

const passthrough: Decoder = (v) => v;

/** "BSH.Common.EnumType.OperationState.Run" -> "Run"; passthrough otherwise. */
const decodeLastSegment: Decoder = (v) =>
  typeof v === "string" && v.includes(".") ? v.split(".").pop() : v;

const decodeBool: Decoder = (v) => v === true || v === "true" || v === 1 || v === "1";

const decodeSecondsToMinutes: Decoder = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n / 60) : v;
};

const decodeNumber: Decoder = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : v;
};

/**
 * The appliance reports percentages in basis-points-like units: 5000 == 50%.
 * (refCID 11 / refDID A0 in the IDDF feature descriptor.) Divide by 100.
 */
const decodePercent: Decoder = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n / 100) : v;
};

const encodeBool: Encoder = (v) => v === true;

const encodeNumber: Encoder = (v) => (typeof v === "number" ? v : Number(v));

const encodeMinutesToSeconds: Encoder = (v) =>
  typeof v === "number" ? Math.round(v * 60) : v;

/**
 * Encode a Homey enum capability value back to the numeric index the
 * appliance expects, by reverse-looking-up the matching member name in
 * `feature.values`.
 */
const encodeEnumIndex: Encoder = (v, feature) => {
  if (!feature?.values) return null;
  const target = String(v);
  for (const [num, name] of Object.entries(feature.values)) {
    if (name === target || (typeof name === "string" && name.endsWith(`.${target}`))) {
      return Number(num);
    }
  }
  return null;
};

/** PowerState: boolean <-> enum index ("On" / "Off" or "Standby"). */
const encodePowerState: Encoder = (v, feature) => {
  if (!feature?.values) return null;
  if (v === true) {
    for (const [num, name] of Object.entries(feature.values)) {
      if (name === "On" || (typeof name === "string" && name.endsWith(".On"))) {
        return Number(num);
      }
    }
  } else {
    for (const candidate of ["Standby", "Off"]) {
      for (const [num, name] of Object.entries(feature.values)) {
        if (
          name === candidate ||
          (typeof name === "string" && name.endsWith(`.${candidate}`))
        ) {
          return Number(num);
        }
      }
    }
  }
  return null;
};

const decodePowerState: Decoder = (v) =>
  v === "On" || v === 2 || v === "BSH.Common.EnumType.PowerState.On";

/**
 * Maps a Home Connect feature name to a Homey capability plus value
 * transforms. The map is shared by every appliance type - a device only
 * applies the rows whose capability it actually declares (see the
 * hasCapability guard in applyValues), so oven- and dishwasher-specific
 * rows can coexist here harmlessly.
 *
 * Each row carries:
 *   - decode: how to project the wire value onto the Homey capability
 *   - encode (optional): how to project the capability value back. Rows
 *     without encode are read-only on the Homey side.
 */
const CAPABILITY_MAP: Record<string, CapabilityMapEntry> = {
  // ===== Shared (BSH.Common) ===============================================
  "BSH.Common.Setting.PowerState": {
    capability: "onoff",
    decode: decodePowerState,
    encode: encodePowerState,
  },
  "BSH.Common.Status.OperationState": {
    capability: "homeconnect_operation_state",
    decode: decodeLastSegment,
  },
  "BSH.Common.Status.DoorState": {
    capability: "homeconnect_door_state",
    decode: decodeLastSegment,
  },
  "BSH.Common.Status.RemoteControlStartAllowed": {
    capability: "homeconnect_remote_start",
    decode: decodeBool,
  },
  "BSH.Common.Status.RemoteControlActive": {
    capability: "homeconnect_remote_control_active",
    decode: decodeBool,
  },
  "BSH.Common.Status.LocalControlActive": {
    capability: "homeconnect_local_control_active",
    decode: decodeBool,
  },
  "BSH.Common.Status.Program.All.Count.Started": {
    capability: "homeconnect_program_count_started",
    decode: decodeNumber,
  },
  "BSH.Common.Option.RemainingProgramTime": {
    capability: "homeconnect_remaining_time",
    decode: decodeSecondsToMinutes,
  },
  "BSH.Common.Option.ElapsedProgramTime": {
    capability: "homeconnect_elapsed_time",
    decode: decodeSecondsToMinutes,
  },
  "BSH.Common.Option.StartInRelative": {
    capability: "homeconnect_start_in_relative",
    decode: decodeSecondsToMinutes,
  },
  "BSH.Common.Option.ProgramProgress": {
    capability: "homeconnect_program_progress",
    decode: decodePercent,
  },
  "BSH.Common.Option.EnergyForecast": {
    capability: "homeconnect_energy_forecast",
    decode: decodePercent,
  },
  "BSH.Common.Option.WaterForecast": {
    capability: "homeconnect_water_forecast",
    decode: decodePercent,
  },
  "BSH.Common.Root.ActiveProgram": {
    capability: "homeconnect_program",
    decode: decodeLastSegment,
  },
  "BSH.Common.Root.SelectedProgram": {
    capability: "homeconnect_selected_program",
    decode: decodeLastSegment,
  },
  "BSH.Common.Setting.ChildLock": {
    capability: "homeconnect_child_lock",
    decode: decodeBool,
    encode: encodeBool,
  },
  // ===== Oven (Cooking.Oven) ===============================================
  "Cooking.Oven.Status.Cavity.001.CurrentTemperature": {
    capability: "measure_temperature",
    decode: decodeNumber,
  },
  // Cooking.Oven.Option.SetpointTemperature is intentionally not a capability:
  // the Homey thermostat UI doesn't match oven semantics (setpoint is only
  // meaningful while a program is selected). Exposed as a Flow action instead
  // - see drivers/oven/driver.ts → oven_set_target_temperature.
  "Cooking.Oven.Status.Cavity.001.MeatprobePlugged": {
    capability: "homeconnect_meat_probe_plugged",
    decode: decodeBool,
  },
  "Cooking.Oven.Status.Cavity.001.CurrentMeatprobeTemperature": {
    capability: "homeconnect_meat_probe_temp",
    decode: decodeNumber,
  },
  "Cooking.Oven.Option.MeatProbeTemperatureV2": {
    capability: "homeconnect_meat_probe_target",
    // The appliance enumerates "Off", "30dC", "31dC", ... up to "99dC".
    // Surface as a plain °C number (0 == off).
    decode: (v) => {
      if (typeof v !== "string") return v;
      if (v === "Off") return 0;
      const m = v.match(/^(\d+)/);
      return m ? Number(m[1]) : v;
    },
    encode: (v, feature) => {
      if (!feature?.values) return null;
      const target = Number(v) === 0 ? "Off" : `${v}dC`;
      for (const [num, name] of Object.entries(feature.values)) {
        if (name === target) return Number(num);
      }
      return null;
    },
  },
  "Cooking.Oven.Status.Cavity.001.Duration": {
    capability: "homeconnect_program_duration",
    decode: decodeSecondsToMinutes,
  },
  "Cooking.Oven.Setting.Light.Cavity.001.Power": {
    capability: "homeconnect_cavity_light",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Cooking.Oven.Option.FastPreHeat": {
    capability: "homeconnect_fast_preheat",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Cooking.Oven.Setting.Cavity.001.AlarmClock": {
    capability: "homeconnect_alarm_clock",
    decode: decodeSecondsToMinutes,
    encode: encodeMinutesToSeconds,
  },
  "Cooking.Oven.Option.PyrolysisLevel": {
    capability: "homeconnect_pyrolysis_level",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Cooking.Oven.Setting.CountUpTimer": {
    capability: "homeconnect_count_up_timer",
    // Reported as enum "On"/"Off"; expose as boolean.
    decode: (v) => v === "On" || v === true,
    encode: (v, feature) => {
      if (feature?.values) {
        const target = v ? "On" : "Off";
        for (const [num, name] of Object.entries(feature.values)) {
          if (name === target) return Number(num);
        }
      }
      return v === true;
    },
  },
  "Cooking.Oven.Setting.DisplayBrightness": {
    capability: "homeconnect_display_brightness",
    // Reported 0..4; surface as 0..100% for a nicer slider.
    decode: (v) => (typeof v === "number" ? Math.round((v / 4) * 100) : v),
    encode: (v) => (typeof v === "number" ? Math.round((v / 100) * 4) : v),
  },
  "Cooking.Oven.Setting.ButtonTones": {
    capability: "homeconnect_button_tones",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Cooking.Oven.Setting.SignalDuration": {
    capability: "homeconnect_signal_duration",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  // ===== Dishwasher (Dishcare.Dishwasher) ==================================
  "Dishcare.Dishwasher.Status.ProgramPhase": {
    capability: "homeconnect_program_phase",
    decode: decodeLastSegment,
  },
  "Dishcare.Dishwasher.Status.EcoDryActive": {
    capability: "homeconnect_eco_dry_active",
    decode: decodeBool,
  },
  "Dishcare.Dishwasher.Status.MachineCareReminder.RemainingProgramRuns": {
    capability: "homeconnect_machine_care_runs_left",
    decode: decodeNumber,
  },
  "Dishcare.Dishwasher.Status.SilenceOnDemandRemainingTime": {
    capability: "homeconnect_silence_remaining",
    decode: decodeSecondsToMinutes,
  },
  "Dishcare.Dishwasher.Option.HalfLoad": {
    capability: "homeconnect_half_load",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Option.SilenceOnDemand": {
    capability: "homeconnect_silence_on_demand",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Option.IntensivZone": {
    capability: "homeconnect_intensiv_zone",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Option.VarioSpeedPlus": {
    capability: "homeconnect_vario_speed_plus",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Option.HygienePlus": {
    capability: "homeconnect_hygiene_plus",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Option.BrillianceDry": {
    capability: "homeconnect_brilliance_dry",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Setting.ExtraDry": {
    capability: "homeconnect_extra_dry",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Setting.EcoAsDefault": {
    capability: "homeconnect_eco_as_default",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.DryingAssistantAllPrograms": {
    capability: "homeconnect_drying_assistant",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.GapIllumination": {
    capability: "homeconnect_gap_illumination",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Dishcare.Dishwasher.Setting.RinseAid": {
    capability: "homeconnect_rinse_aid_level",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.WaterHardness": {
    capability: "homeconnect_water_hardness",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.HotWater": {
    capability: "homeconnect_hot_water_connection",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.SensitivityTurbidity": {
    capability: "homeconnect_sensitivity_turbidity",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.SoundLevelSignal": {
    capability: "homeconnect_sound_level_signal",
    decode: passthrough,
    encode: encodeEnumIndex,
  },
  "Dishcare.Dishwasher.Setting.SilenceOnDemandDefaultTime": {
    capability: "homeconnect_silence_default_time",
    decode: decodeSecondsToMinutes,
    encode: encodeMinutesToSeconds,
  },
};

/** Insert spaces so a program's last segment reads nicely in the UI. */
function prettify(segment: string): string {
  return segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .trim();
}

/**
 * Shape of the driver as far as the device cares: it owns the trigger cards.
 * Each property is optional because not every driver needs every trigger
 * (an undefined card means "this driver chose not to fire this event").
 */
type TriggerDriver = Homey.Driver & {
  programFinishedTrigger?: Homey.FlowCardTriggerDevice;
  doorChangedTrigger?: Homey.FlowCardTriggerDevice;
  operationStateChangedTrigger?: Homey.FlowCardTriggerDevice;
  programProgressChangedTrigger?: Homey.FlowCardTriggerDevice;
  programStartedTrigger?: Homey.FlowCardTriggerDevice;
  programAbortedTrigger?: Homey.FlowCardTriggerDevice;
  doorOpenedTrigger?: Homey.FlowCardTriggerDevice;
  doorClosedTrigger?: Homey.FlowCardTriggerDevice;
  remoteStartAllowedChangedTrigger?: Homey.FlowCardTriggerDevice;
  remoteControlActiveChangedTrigger?: Homey.FlowCardTriggerDevice;
  localControlChangedTrigger?: Homey.FlowCardTriggerDevice;
  remainingTimeChangedTrigger?: Homey.FlowCardTriggerDevice;
  elapsedTimeChangedTrigger?: Homey.FlowCardTriggerDevice;
  childLockChangedTrigger?: Homey.FlowCardTriggerDevice;
  errorOccurredTrigger?: Homey.FlowCardTriggerDevice;
  /** Dishwasher-only; undefined on drivers that don't declare the card. */
  programPhaseChangedTrigger?: Homey.FlowCardTriggerDevice;
  getEventMap?: () => Record<string, EventTriggerSpec>;
};

/** Translates an appliance event (Off→Present transition) into a Flow trigger. */
export interface EventTriggerSpec {
  /** Flow trigger property name on the driver, e.g. "saltLow". */
  triggerKey: string;
  /** Optional token producer; receives the feature name that fired. */
  tokens?: (featureName: string) => Record<string, unknown>;
}

/**
 * Base class shared by every appliance driver's device (oven, dishwasher,
 * ...). It owns the whole local-protocol lifecycle: looking up the config,
 * the websocket connection + reconnect, decoding value updates onto Homey
 * capabilities, firing the Flow triggers, and the program-control helpers
 * the Flow actions delegate to. Per-type drivers subclass this with nothing
 * more than their own capability set (declared in driver.compose.json).
 */
export class ApplianceDevice extends Homey.Device {
  protected config!: DeviceConfig;
  /**
   * Static feature map used for Homey capability add/remove decisions.
   *
   * The appliance can send /ro/descriptionChange notifications while running
   * (for example when remote-control access temporarily changes). Those
   * changes should affect command validation, not the shape of the Homey
   * device. Capability shape is therefore synced from this startup snapshot,
   * not from the live descriptors patched by the websocket client.
   */
  private capabilitySyncFeatures: Record<string, FeatureDescriptor> = {};
  private client: HomeConnectClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private refreshValuesTimer: NodeJS.Timeout | null = null;
  private connectionGeneration = 0;
  private stopped = false;
  private readonly eventStates = new Map<string, unknown>();

  async onInit(): Promise<void> {
    this.stopped = false;
    // The pairing payload is lean (just data.id), so on first init the store
    // is empty - look the full config up from the app (the source of truth)
    // and persist it so the device stays self-contained afterwards.
    this.config = this.getStoreValue("config") as DeviceConfig;
    const haId = String(this.getData().id);
    const fromApp = (
      this.homey.app as unknown as { getDevice(id: string): DeviceConfig | undefined }
    ).getDevice(haId);
    if (!this.config?.key) {
      if (fromApp?.key) {
        this.config = fromApp;
        await this.setStoreValue("config", fromApp);
      }
    } else if (fromApp?.key && this.configChanged(fromApp)) {
      this.config = {
        ...fromApp,
        // Keep a discovery-resolved address if we already learned one.
        host: this.config.host || fromApp.host,
      };
      await this.setStoreValue("config", this.config);
    }
    if (!this.config?.key) {
      await this.setUnavailable(this.homey.__("device.error.no_keys"));
      return;
    }

    this.capabilitySyncFeatures = this.cloneFeatureMap(this.config.features ?? {});

    // Migration: target_temperature briefly shipped as a writable capability
    // but didn't match oven semantics. Pull it off existing paired devices.
    if (this.hasCapability("target_temperature")) {
      await this.removeCapability("target_temperature").catch(this.error);
    }

    // Drop capabilities whose backing feature is absent from this particular
    // appliance. This is a device-shape sync and must not run from live
    // description notifications, because access/availability can reflect
    // transient state rather than what the appliance fundamentally supports.
    await this.syncCapabilities();

    // Register a write-back listener for every writable capability this
    // device actually declares (post-sync), wired through CAPABILITY_MAP.
    this.registerWritableCapabilities();

    await this.connect();
  }

  /** Clone the static feature map before the client mutates live descriptors. */
  private cloneFeatureMap(
    features: Record<string, FeatureDescriptor>,
  ): Record<string, FeatureDescriptor> {
    return Object.fromEntries(
      Object.entries(features).map(([uid, feature]) => [uid, { ...feature }]),
    );
  }

  private configChanged(next: DeviceConfig): boolean {
    return (
      this.config.key !== next.key ||
      this.config.iv !== next.iv ||
      this.config.description?.version !== next.description?.version ||
      this.config.description?.revision !== next.description?.revision ||
      JSON.stringify(this.config.features ?? {}) !== JSON.stringify(next.features ?? {})
    );
  }

  /**
   * Walk the driver-declared capabilities; for each row in CAPABILITY_MAP whose
   * feature isn't present in the startup feature map, remove the capability so
   * the user never sees a capability this appliance model cannot support. Do
   * not use `access` or `available` here: Home Connect may change those while
   * the appliance changes mode or remote-control state, and Homey capabilities
   * should describe model support, not current writeability.
   */
  private async syncCapabilities(): Promise<void> {
    const declared = new Set<string>(this.driver.manifest.capabilities ?? []);

    for (const [featureName, entry] of Object.entries(CAPABILITY_MAP)) {
      if (!declared.has(entry.capability)) continue;
      const feature = this.findFeature(featureName, this.capabilitySyncFeatures);
      const usable = feature != null;
      const has = this.hasCapability(entry.capability);
      if (usable && !has) {
        await this.addCapability(entry.capability).catch(this.error);
      } else if (!usable && has) {
        await this.removeCapability(entry.capability).catch(this.error);
      }
    }
  }

  /** Per-driver event spec, falling back to {} if the driver doesn't define one. */
  private eventMap(): Record<string, EventTriggerSpec> {
    const d = this.driver as TriggerDriver;
    return typeof d.getEventMap === "function" ? d.getEventMap() : {};
  }

  /** Set up registerCapabilityListener for every writable capability. */
  private registerWritableCapabilities(): void {
    for (const [featureName, entry] of Object.entries(CAPABILITY_MAP)) {
      if (!entry.encode) continue;
      if (!this.hasCapability(entry.capability)) continue;
      this.registerCapabilityListener(entry.capability, async (value: unknown) => {
        await this.setMappedCapabilityValue(entry.capability, value);
      });
    }
  }

  private async connect(): Promise<void> {
    this.clearReconnect();
    const generation = ++this.connectionGeneration;
    const previous = this.client;
    const client = new HomeConnectClient(this.config);
    this.client = client;
    previous?.close();

    const isCurrent = (): boolean =>
      !this.stopped && this.client === client && this.connectionGeneration === generation;

    client.on("connected", () => {
      if (!isCurrent()) return;
      this.setAvailable().catch(this.error);
      this.log("connected to appliance");
    });

    client.on("values", (values: Record<string, unknown>) => {
      if (!isCurrent()) return;
      this.applyValues(values).catch(this.error);
    });

    client.on("description", (changed: string[]) => {
      if (!isCurrent()) return;
      this.log(`description changed: ${changed.join(", ")}`);
      // Deliberately do not call syncCapabilities() here. Description changes
      // are live protocol state (access/availability/min/max), and using them
      // to add/remove Homey capabilities makes device tiles glitch while the
      // appliance changes mode. The client has already patched the live
      // descriptors used by writes; only capability values should change here.
      this.scheduleValueRefresh();
    });

    client.on("close", (code: number, reason: string) => {
      if (!isCurrent()) return;
      this.log(`websocket closed (${code} ${reason}) - reconnecting`);
      this.setUnavailable(this.homey.__("device.error.unreachable")).catch(this.error);
      this.scheduleReconnect();
    });

    client.on("error", (err: Error) => {
      if (!isCurrent()) return;
      this.error("client error:", err.message);
    });

    try {
      await client.connect();
    } catch (err) {
      if (!isCurrent()) return;
      this.error("connect failed:", (err as Error).message);
      this.setUnavailable(this.homey.__("device.error.unreachable")).catch(this.error);
      this.scheduleReconnect();
    }
  }

  /** Push a batch of decoded feature values onto Homey capabilities. */
  private async applyValues(values: Record<string, unknown>): Promise<void> {
    for (const [name, raw] of Object.entries(values)) {
      // Events don't represent state, they fire triggers and get acked.
      if (name.includes(".Event.")) {
        this.handleEvent(name, raw);
        continue;
      }

      const mapping = CAPABILITY_MAP[name];
      if (!mapping || !this.hasCapability(mapping.capability)) continue;

      const feature = this.findFeature(name);
      const value = mapping.decode(raw, feature);
      if (value === this.getCapabilityValue(mapping.capability)) continue;

      try {
        await this.setCapabilityValue(mapping.capability, value as never);
      } catch (err) {
        this.error(err);
        continue;
      }
      this.fireTriggers(mapping.capability, value);
    }
    this.reconcileDerivedState();
  }

  /**
   * An appliance event arrived (e.g. salt low). hcpy treats values like
   * "Off" / "Present" / "Confirmed". We fire a Flow trigger on the
   * Off->Present edge and immediately acknowledge so the appliance stops
   * re-firing it.
   */
  private handleEvent(featureName: string, raw: unknown): void {
    const previous = this.eventStates.get(featureName);
    this.eventStates.set(featureName, raw);
    if (raw !== "Present" || previous === "Present") return;
    const driver = this.driver as TriggerDriver;
    const spec = this.eventMap()[featureName];
    if (spec) {
      const trigger = (driver as unknown as Record<string, Homey.FlowCardTriggerDevice>)[
        `${spec.triggerKey}Trigger`
      ];
      if (trigger) {
        const tokens = spec.tokens ? spec.tokens(featureName) : {};
        trigger.trigger(this, tokens, {}).catch(this.error);
      } else {
        this.error(`event ${featureName} mapped to unknown trigger ${spec.triggerKey}`);
      }
    } else if (driver.errorOccurredTrigger) {
      // Unmapped event: surface as a generic error_occurred trigger with the
      // bare event name as a token, so users can still react to unknowns.
      const code = featureName.split(".").pop() ?? featureName;
      driver.errorOccurredTrigger.trigger(this, { error_code: code }, {}).catch(this.error);
    }
    this.acknowledgeEvent();
  }

  private acknowledgeEvent(): void {
    const uid = this.findUid("BSH.Common.Command.AcknowledgeEvent");
    if (uid == null) return;
    const feature = this.config.features?.[String(uid)];
    if (!this.isFeatureWritableNow(feature)) return;
    this.client?.setValue(uid, true).catch((err) => {
      // AcknowledgeEvent is best-effort cleanup after a notification. Some
      // appliances reject it when the event already cleared; that should not
      // surface as a Homey device error.
      this.log(`AcknowledgeEvent ignored: ${(err as Error).message}`);
    });
  }

  /** Fire the relevant Flow triggers for a capability that just changed. */
  private fireTriggers(capability: string, value: unknown): void {
    const driver = this.driver as TriggerDriver;
    if (capability === "homeconnect_operation_state") {
      driver.operationStateChangedTrigger
        ?.trigger(this, { operation_state: String(value) }, {})
        .catch(this.error);
      if (value === "Finished") {
        driver.programFinishedTrigger?.trigger(this, {}, {}).catch(this.error);
      }
      if (value === "Run") {
        driver.programStartedTrigger?.trigger(this, {}, {}).catch(this.error);
      }
      if (value === "Aborting") {
        driver.programAbortedTrigger?.trigger(this, {}, {}).catch(this.error);
      }
    }
    if (capability === "homeconnect_door_state") {
      driver.doorChangedTrigger
        ?.trigger(this, { door_state: String(value) }, {})
        .catch(this.error);
      if (value === "Open") {
        driver.doorOpenedTrigger?.trigger(this, {}, {}).catch(this.error);
      } else if (value === "Closed" || value === "Locked") {
        driver.doorClosedTrigger?.trigger(this, {}, {}).catch(this.error);
      }
    }
    if (capability === "homeconnect_program_progress" && typeof value === "number") {
      driver.programProgressChangedTrigger
        ?.trigger(this, { progress: value }, {})
        .catch(this.error);
    }
    if (capability === "homeconnect_remaining_time" && typeof value === "number") {
      driver.remainingTimeChangedTrigger
        ?.trigger(this, { minutes: value }, {})
        .catch(this.error);
    }
    if (capability === "homeconnect_elapsed_time" && typeof value === "number") {
      driver.elapsedTimeChangedTrigger?.trigger(this, { minutes: value }, {}).catch(this.error);
    }
    if (capability === "homeconnect_remote_start") {
      driver.remoteStartAllowedChangedTrigger
        ?.trigger(this, { allowed: Boolean(value) }, {})
        .catch(this.error);
    }
    if (capability === "homeconnect_remote_control_active") {
      driver.remoteControlActiveChangedTrigger
        ?.trigger(this, { active: Boolean(value) }, {})
        .catch(this.error);
    }
    if (capability === "homeconnect_local_control_active") {
      driver.localControlChangedTrigger
        ?.trigger(this, { active: Boolean(value) }, {})
        .catch(this.error);
    }
    if (capability === "homeconnect_child_lock") {
      driver.childLockChangedTrigger
        ?.trigger(this, { enabled: Boolean(value) }, {})
        .catch(this.error);
    }
    if (capability === "homeconnect_program_phase") {
      driver.programPhaseChangedTrigger
        ?.trigger(this, { phase: String(value) }, {})
        .catch(this.error);
    }
  }

  /**
   * The appliance stops pushing progress / remaining-time updates the moment
   * it is no longer running (program ended, aborted, or powered off), so the
   * last values would otherwise stay frozen on screen. Once we observe a
   * non-running state we clear the derived capabilities ourselves.
   */
  private reconcileDerivedState(): void {
    const state = this.getCapabilityValue("homeconnect_operation_state");
    const power = this.getCapabilityValue("onoff");
    const running =
      power !== false && typeof state === "string" && RUNNING_STATES.has(state);
    if (running) return;

    const clear = (capability: string, value: unknown): void => {
      if (this.hasCapability(capability) && this.getCapabilityValue(capability) !== value) {
        this.setCapabilityValue(capability, value as never).catch(this.error);
      }
    };
    clear("homeconnect_program_progress", null);
    clear("homeconnect_remaining_time", null);
    clear("homeconnect_elapsed_time", null);
    clear("homeconnect_start_in_relative", null);
    clear("homeconnect_program_phase", "None");
    // Keep the program name on "Finished" so the user can still see what ran.
    if (state !== "Finished") clear("homeconnect_program", null);
  }

  // --- program control (delegated to from the driver's Flow cards) ---------

  /** The appliance's programs as Homey autocomplete results, filtered by query. */
  listPrograms(query = ""): Array<{ name: string; id: string }> {
    const q = query.trim().toLowerCase();
    return Object.values(this.config.features ?? {})
      .map((f) => f.name)
      .filter((name): name is string => typeof name === "string" && name.includes(".Program."))
      .map((name) => ({ name: prettify(name.split(".").pop() as string), id: name }))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Start a program now. `opts` may include legacy oven extras (temperature
   * °C / duration min) and an optional `delayMinutes` which adds the
   * BSH.Common.Option.StartInRelative option.
   */
  async startProgram(
    programName: string,
    opts: { temperature?: number; duration?: number; delayMinutes?: number } = {},
  ): Promise<void> {
    const programUid = this.findUid(programName);
    if (programUid == null) throw new Error(this.homey.__("device.error.unknown_program"));
    if (this.getCapabilityValue("homeconnect_remote_start") === false) {
      throw new Error(this.homey.__("device.error.remote_start_not_allowed"));
    }

    const options: Array<{ uid: number; value: unknown }> = [];
    if (opts.temperature != null) {
      const uid = this.findUid("Cooking.Oven.Option.SetpointTemperature");
      if (uid != null) options.push({ uid, value: Math.round(opts.temperature) });
    }
    if (opts.duration != null) {
      const uid = this.findUid("BSH.Common.Option.Duration");
      // The Duration option is in seconds; the Flow argument is in minutes.
      if (uid != null) options.push({ uid, value: Math.round(opts.duration * 60) });
    }
    if (opts.delayMinutes != null && opts.delayMinutes > 0) {
      const uid = this.findUid("BSH.Common.Option.StartInRelative");
      if (uid == null) {
        throw new Error(this.homey.__("device.error.feature_not_supported"));
      }
      options.push({ uid, value: Math.round(opts.delayMinutes * 60) });
    }

    this.log(`startProgram ${programName} uid=${programUid} options=${JSON.stringify(options)}`);
    if (!this.client) throw new Error("not connected");
    await this.client.startProgram(programUid, options);
  }

  /** Queue a program without starting it (sets BSH.Common.Root.SelectedProgram). */
  async selectProgram(programName: string): Promise<void> {
    const programUid = this.findUid(programName);
    if (programUid == null) throw new Error(this.homey.__("device.error.unknown_program"));
    if (!this.client) throw new Error("not connected");
    this.log(`selectProgram ${programName} uid=${programUid}`);
    await this.client.selectProgram(programUid, []);
  }

  /** Fire a BSH.Common.Command.* (AbortProgram / PauseProgram / ResumeProgram). */
  async sendCommand(command: "AbortProgram" | "PauseProgram" | "ResumeProgram"): Promise<void> {
    const uid = this.findUid(`BSH.Common.Command.${command}`);
    if (uid == null) throw new Error(`This appliance does not support ${command}`);
    this.assertFeatureWritableNow(this.config.features?.[String(uid)]);
    if (!this.client) throw new Error("not connected");
    this.log(`sendCommand ${command} uid=${uid}`);
    await this.client.setValue(uid, true);
  }

  /** Write a mapped writable capability to the appliance without faking local state. */
  async setMappedCapabilityValue(capability: string, value: unknown): Promise<void> {
    const row = Object.entries(CAPABILITY_MAP).find(([, entry]) => entry.capability === capability);
    if (!row) {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
    const [featureName, entry] = row;
    if (!entry.encode) {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
    const uid = this.findUid(featureName);
    if (uid == null) {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
    const feature = this.config.features?.[String(uid)];
    this.assertFeatureWritableNow(feature);
    const encoded = entry.encode(value, feature);
    if (encoded == null) {
      throw new Error(this.homey.__("device.error.invalid_value"));
    }
    if (!this.client) {
      throw new Error("not connected");
    }
    this.log(
      `${capability} -> ${JSON.stringify(value)}; ${featureName} uid=${uid} value=${JSON.stringify(encoded)}`,
    );
    await this.client.setValue(uid, encoded);
  }

  /**
   * Write a value to a feature by name, without a capability in the loop.
   * Used by per-driver Flow actions that target a setting/option which we
   * intentionally don't surface as a Homey capability (e.g. oven setpoint).
   */
  async setSettingValue(featureName: string, value: unknown): Promise<void> {
    const uid = this.findUid(featureName);
    if (uid == null) {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
    this.assertFeatureWritableNow(this.config.features?.[String(uid)]);
    if (!this.client) {
      throw new Error("not connected");
    }
    this.log(`setSettingValue ${featureName} uid=${uid} value=${JSON.stringify(value)}`);
    await this.client.setValue(uid, value);
  }

  /** Send AcknowledgeEvent (clears whatever event is currently signalled). */
  async acknowledgeCurrentEvent(): Promise<void> {
    const uid = this.findUid("BSH.Common.Command.AcknowledgeEvent");
    if (uid == null) {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
    this.assertFeatureWritableNow(this.config.features?.[String(uid)]);
    if (!this.client) {
      throw new Error("not connected");
    }
    await this.client.setValue(uid, true);
  }

  // --- feature-map helpers -------------------------------------------------

  /** Look up the appliance-specific numeric UID for a feature name. */
  protected findUid(featureName: string): number | null {
    const features = this.config.features ?? {};
    for (const [uid, descriptor] of Object.entries(features)) {
      if (descriptor.name === featureName) return Number(uid);
    }
    return null;
  }

  /** Look up a feature descriptor by name (for value-enum reverse lookup). */
  protected findFeature(
    featureName: string,
    features: Record<string, FeatureDescriptor> = this.config.features ?? {},
  ): FeatureDescriptor | undefined {
    for (const descriptor of Object.values(features)) {
      if (descriptor.name === featureName) return descriptor;
    }
    return undefined;
  }

  /**
   * `/ro/descriptionChange` mutates access/availability while the appliance
   * changes state. Respect that live descriptor for writes, but never for
   * adding/removing Homey capabilities.
   */
  private isFeatureWritableNow(feature?: FeatureDescriptor): boolean {
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

  private assertFeatureWritableNow(feature?: FeatureDescriptor): void {
    if (!this.isFeatureWritableNow(feature)) {
      throw new Error(this.homey.__("device.error.feature_not_available"));
    }
  }

  /** Reverse-resolve an enum member name to its numeric value for a feature. */
  protected enumValue(uid: number, memberName: string): number | null {
    const values = this.config.features?.[String(uid)]?.values;
    if (!values) return null;
    for (const [num, name] of Object.entries(values)) {
      if (name === memberName || (typeof name === "string" && name.endsWith(`.${memberName}`))) {
        return Number(num);
      }
    }
    return null;
  }

  // --- reconnect bookkeeping ----------------------------------------------

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnectTimer = this.homey.setTimeout(() => {
      this.connect().catch(this.error);
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      this.homey.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleValueRefresh(): void {
    if (this.refreshValuesTimer) {
      this.homey.clearTimeout(this.refreshValuesTimer);
    }
    this.refreshValuesTimer = this.homey.setTimeout(() => {
      this.refreshValuesTimer = null;
      this.client?.refreshValues();
    }, 500);
  }

  private clearValueRefresh(): void {
    if (this.refreshValuesTimer) {
      this.homey.clearTimeout(this.refreshValuesTimer);
      this.refreshValuesTimer = null;
    }
  }

  // --- mDNS discovery: keep the host in sync if the appliance's IP moves ---

  onDiscoveryResult(result: Homey.DiscoveryResult): boolean {
    return result.id === this.config.haId;
  }

  async onDiscoveryAvailable(result: Homey.DiscoveryResult): Promise<void> {
    const address = (result as { address?: string }).address;
    if (address && address !== this.config.host) {
      this.config.host = address;
      await this.setStoreValue("config", this.config);
      await this.connect();
    }
  }

  async onDiscoveryAddressChanged(result: Homey.DiscoveryResult): Promise<void> {
    await this.onDiscoveryAvailable(result);
  }

  async onUninit(): Promise<void> {
    this.stopped = true;
    this.connectionGeneration++;
    this.clearReconnect();
    this.clearValueRefresh();
    this.client?.close();
    this.client = null;
  }

  async onDeleted(): Promise<void> {
    this.stopped = true;
    this.connectionGeneration++;
    this.clearReconnect();
    this.clearValueRefresh();
    this.client?.close();
    this.client = null;
  }
}

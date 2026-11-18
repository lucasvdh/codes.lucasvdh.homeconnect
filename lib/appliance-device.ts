"use strict";

import net from "net";
import Homey from "homey";

import { DeviceConfig, FeatureDescriptor } from "./types";
import { HomeConnectClient } from "./home-connect-client";
import { mergeStoredConfig } from "./device-config";
import {
  ConnectionReason,
  QUIET_RETRY_MS,
  classifyClose,
  classifyError,
  retryQuietly,
} from "./connection-errors";
import { ConnectionStatusStore } from "./connection-status";
import { matchMdnsResult } from "./mdns-match";
import { describeFeatureState, isFeatureWritableNow } from "./feature-state";

// Gentle on purpose: an appliance that refuses us (other controller, wrong key)
// shouldn't be hammered.
const RECONNECT_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

interface AppApi {
  getDevice(id: string): DeviceConfig | undefined;
  connectionStatus: ConnectionStatusStore;
  findMdnsAddress(haId: string): { address: string; via?: string } | null;
}

const RUNNING_STATES = new Set(["Run", "DelayedStart", "Pause", "ActionRequired"]);

// An idle appliance still sends stale values for these; applying them fights
// reconcileDerivedState() and makes the tiles flicker.
const RUNNING_ONLY_FEATURES = new Set([
  "BSH.Common.Option.RemainingProgramTime",
  "BSH.Common.Option.ElapsedProgramTime",
  "BSH.Common.Option.StartInRelative",
]);

type Decoder = (v: unknown, feature?: FeatureDescriptor) => unknown;
type Encoder = (v: unknown, feature?: FeatureDescriptor) => unknown;

interface CapabilityMapEntry {
  capability: string;
  decode: Decoder;
  /** Absent for capabilities that are read-only in Homey. */
  encode?: Encoder;
  /** Set on the running -> idle edge, for values the appliance doesn't reset (hood fan stage). */
  idleValue?: unknown;
  /** Fire `<key>Trigger` on the driver with the new value as `token` on change. */
  trigger?: { key: string; token: string };
}

const passthrough: Decoder = (v) => v;

/** "BSH.Common.EnumType.OperationState.Run" -> "Run"; passthrough otherwise. */
const decodeLastSegment: Decoder = (v) =>
  typeof v === "string" && v.includes(".") ? v.split(".").pop() : v;

/** derived capability -> the capability it is computed from */
const DERIVED_CAPABILITIES: Record<string, string> = {
  homeconnect_remaining_time_display: "homeconnect_remaining_time",
};

// "h:mm" like the appliance display. A string, because a number can't be a status indicator.
export function formatMinutes(minutes: unknown): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return null;
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

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

// "...SpinSpeed.RPM1200" -> 1200, "GC40" -> 40.
// "Off" / "Cold" -> null, shown as "-" rather than a misleading 0.
const decodeEnumToNumber: Decoder = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const segment = v.includes(".") ? v.slice(v.lastIndexOf(".") + 1) : v;
  const digits = segment.match(/\d+/);
  if (digits) return Number(digits[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Already 0-100 (IDDF refCID 11 / refDID A0), so no scaling (#9).
const decodePercent: Decoder = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : v;
};

const encodeBool: Encoder = (v) => v === true;

const encodeNumber: Encoder = (v) => (typeof v === "number" ? v : Number(v));

const encodeMinutesToSeconds: Encoder = (v) =>
  typeof v === "number" ? Math.round(v * 60) : v;

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

// Shared by all appliance types: a device only applies the rows whose capability it declares.
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
  // SetpointTemperature is deliberately a Flow action (oven_set_target_temperature), not a
  // capability: it only means something while a program is selected.
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
    // Enum "Off", "30dC" .. "99dC"; 0 means off.
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
    // Reported as 0..4.
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
  // ===== Washer (LaundryCare.Washer) =======================================
  "LaundryCare.Washer.Option.Temperature": {
    capability: "homeconnect_wash_temperature",
    decode: decodeLastSegment,
    encode: encodeEnumIndex,
  },
  "LaundryCare.Washer.Option.SpinSpeed": {
    capability: "homeconnect_spin_speed",
    decode: decodeLastSegment,
    encode: encodeEnumIndex,
  },
  "LaundryCare.Washer.Option.VarioPerfect": {
    capability: "homeconnect_vario_perfect",
    decode: decodeLastSegment,
    encode: encodeEnumIndex,
  },
  "LaundryCare.Washer.Option.SpeedPerfect": {
    capability: "homeconnect_speed_perfect",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.EcoPerfect": {
    capability: "homeconnect_eco_perfect",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.WaterPlus": {
    capability: "homeconnect_water_plus",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.Prewash": {
    capability: "homeconnect_prewash",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.RinsePlus": {
    capability: "homeconnect_rinse_plus",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.LessIroning": {
    capability: "homeconnect_less_ironing",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.Soak": {
    capability: "homeconnect_soak",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.MultipleSoak": {
    capability: "homeconnect_multiple_soak",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.RinseHold": {
    capability: "homeconnect_rinse_hold",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.IDos1.Active": {
    capability: "homeconnect_idos1_active",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Washer.Option.IDos2.Active": {
    capability: "homeconnect_idos2_active",
    decode: decodeBool,
    encode: encodeBool,
  },
  // ===== Dryer (LaundryCare.Dryer) =========================================
  "LaundryCare.Dryer.Option.DryingTarget": {
    capability: "homeconnect_drying_target",
    decode: decodeLastSegment,
    encode: encodeEnumIndex,
  },
  "LaundryCare.Dryer.Option.WrinkleGuard": {
    capability: "homeconnect_dryer_wrinkle_guard",
    decode: decodeLastSegment,
    encode: encodeEnumIndex,
  },
  "LaundryCare.Dryer.Option.Gentle": {
    capability: "homeconnect_dryer_gentle",
    decode: decodeBool,
    encode: encodeBool,
  },
  "LaundryCare.Dryer.Option.DryingTargetAdjustment": {
    capability: "homeconnect_dryer_drying_target_adjustment",
    decode: decodeLastSegment,
    encode: encodeEnumIndex,
  },
  "LaundryCare.Dryer.Option.ProcessPhase": {
    capability: "homeconnect_dryer_process_phase",
    decode: decodeLastSegment,
  },

  // --- Hood ---------------------------------------------------------------
  // Fan stages are options of the running program, so HoodDevice handles the writes.
  "Cooking.Common.Option.Hood.VentingLevel": {
    capability: "homeconnect_venting_level",
    decode: decodeLastSegment,
    idleValue: "FanOff",
    trigger: { key: "ventingLevelChanged", token: "level" },
  },
  "Cooking.Common.Option.Hood.IntensiveLevel": {
    capability: "homeconnect_intensive_level",
    decode: decodeLastSegment,
    idleValue: "IntensiveStageOff",
  },
  "Cooking.Common.Setting.Lighting": {
    capability: "homeconnect_light",
    decode: decodeBool,
    encode: encodeBool,
  },
  "Cooking.Common.Setting.LightingBrightness": {
    capability: "homeconnect_light_brightness",
    decode: decodeNumber,
    encode: encodeNumber,
  },
  "BSH.Common.Setting.AmbientLightEnabled": {
    capability: "homeconnect_ambient_light",
    decode: decodeBool,
    encode: encodeBool,
  },
  "BSH.Common.Setting.AmbientLightBrightness": {
    capability: "homeconnect_ambient_light_brightness",
    decode: decodeNumber,
    encode: encodeNumber,
  },
  // --- Coffee maker -------------------------------------------------------
  "ConsumerProducts.CoffeeMaker.Option.BeanAmount": {
    capability: "homeconnect_bean_amount",
    decode: decodeLastSegment,
  },
  "ConsumerProducts.CoffeeMaker.Option.FillQuantity": {
    capability: "homeconnect_fill_quantity",
    decode: decodeNumber,
  },
  "ConsumerProducts.CoffeeMaker.Setting.CupWarmer": {
    capability: "homeconnect_cup_warmer",
    decode: decodeBool,
    encode: encodeBool,
  },
  "ConsumerProducts.CoffeeMaker.Status.BeverageCounterCoffee": {
    capability: "homeconnect_beverage_count_coffee",
    decode: decodeNumber,
  },
};

// Numeric copies of enum options, for Flow comparisons like "spin speed > 1000 rpm".
const NUMERIC_MIRRORS: Record<string, string> = {
  homeconnect_spin_speed: "homeconnect_spin_speed_rpm",
  homeconnect_wash_temperature: "homeconnect_wash_temperature_celsius",
};

function prettify(segment: string): string {
  return segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .trim();
}

// Optional: a driver leaves out the cards it doesn't declare.
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
  programPhaseChangedTrigger?: Homey.FlowCardTriggerDevice;
  getEventMap?: () => Record<string, EventSpec>;
};

export interface EventTriggerSpec {
  /** Fires `<triggerKey>Trigger` on the driver. */
  triggerKey: string;
  tokens?: (featureName: string) => Record<string, unknown>;
}

// Logged only: not an error, and left for the user to dismiss on the appliance.
export interface IgnoredEvent {
  ignore: true;
}

export type EventSpec = EventTriggerSpec | IgnoredEvent;

export class ApplianceDevice extends Homey.Device {
  protected config!: DeviceConfig;
  // Capabilities follow this startup snapshot, not the live descriptors: /ro/descriptionChange
  // flips access/availability with the appliance's mode, so tiles would appear and vanish.
  private capabilitySyncFeatures: Record<string, FeatureDescriptor> = {};
  private client: HomeConnectClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private refreshValuesTimer: NodeJS.Timeout | null = null;
  private connectionGeneration = 0;
  private reconnectAttempts = 0;
  private connectedAt = 0;
  private stopped = false;
  private readonly eventStates = new Map<string, unknown>();
  private readonly lastTriggeredValues = new Map<string, unknown>();

  async onInit(): Promise<void> {
    this.stopped = false;
    // Pairing only stores data.id; the full config comes from the app on first init.
    const haId = String(this.getData().id);
    const merged = mergeStoredConfig(
      this.getStoreValue("config") as DeviceConfig | undefined,
      this.app.getDevice(haId),
    );
    this.config = merged.config as DeviceConfig;
    if (merged.changed && this.config) {
      await this.setStoreValue("config", this.config);
    }
    this.log(
      `[conn] init haId=${haId} host=${this.config?.host ?? "-"} address=${this.config?.address ?? "-"} ` +
        `protocol=${this.config?.iv ? "AES" : "TLS-PSK"} model=${this.config?.description?.model ?? "-"}`,
    );
    if (!this.config?.key) {
      await this.setUnavailable(this.homey.__("device.error.no_keys"));
      return;
    }

    this.capabilitySyncFeatures = this.cloneFeatureMap(this.config.features ?? {});

    // Migration: early oven builds had target_temperature.
    if (this.hasCapability("target_temperature")) {
      await this.removeCapability("target_temperature").catch(this.error);
    }

    await this.syncCapabilities();
    await this.syncDriverCapabilities(this.capabilitySyncFeatures);
    this.registerWritableCapabilities();

    await this.connect();
  }

  private cloneFeatureMap(
    features: Record<string, FeatureDescriptor>,
  ): Record<string, FeatureDescriptor> {
    return Object.fromEntries(
      Object.entries(features).map(([uid, feature]) => [uid, { ...feature }]),
    );
  }

  private get app(): AppApi {
    return this.homey.app as unknown as AppApi;
  }

  private get haId(): string {
    return String(this.config?.haId ?? this.getData().id);
  }

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

    for (const [derived, source] of Object.entries(DERIVED_CAPABILITIES)) {
      if (!declared.has(derived)) continue;
      const want = this.hasCapability(source);
      const has = this.hasCapability(derived);
      if (want && !has) {
        await this.addCapability(derived).catch(this.error);
      } else if (!want && has) {
        await this.removeCapability(derived).catch(this.error);
      }
    }
    await this.updateDerivedCapabilities();
  }

  private async updateDerivedCapabilities(): Promise<void> {
    if (this.hasCapability("homeconnect_remaining_time_display")) {
      const text = formatMinutes(this.getCapabilityValue("homeconnect_remaining_time"));
      if (text !== this.getCapabilityValue("homeconnect_remaining_time_display")) {
        await this.setCapabilityValue("homeconnect_remaining_time_display", text as never).catch(
          this.error,
        );
      }
    }
  }

  // For capabilities outside CAPABILITY_MAP; runs before the first values arrive.
  protected async syncDriverCapabilities(_features: Record<string, FeatureDescriptor>): Promise<void> {}

  private eventMap(): Record<string, EventSpec> {
    const d = this.driver as TriggerDriver;
    return typeof d.getEventMap === "function" ? d.getEventMap() : {};
  }

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

    // The hostname is only resolved when both known addresses fail.
    const mdns = this.app.findMdnsAddress(this.haId);
    const preferred = [mdns?.address, this.config.address].filter(
      (a, i, all): a is string => typeof a === "string" && net.isIPv4(a) && all.indexOf(a) === i,
    );
    this.log(
      `[conn] connecting host=${this.config.host} known=${preferred.join(",") || "-"}` +
        (mdns ? ` (mDNS via ${mdns.via})` : " (no mDNS sighting)"),
    );
    this.app.connectionStatus.setState(this.haId, "connecting");

    const client = new HomeConnectClient(this.config, {
      preferredAddresses: preferred,
      log: (line) => this.log(`[conn] ${line}`),
    });
    this.client = client;
    previous?.close();

    const isCurrent = (): boolean =>
      !this.stopped && this.client === client && this.connectionGeneration === generation;

    client.on("connected", () => {
      if (!isCurrent()) return;
      this.reconnectAttempts = 0;
      this.connectedAt = Date.now();
      this.setAvailable().catch(this.error);
      const address = client.address ?? undefined;
      this.log(`[conn] connected via ${address ?? "?"}`);
      this.app.connectionStatus.setState(this.haId, "connected", { address });
      if (address && net.isIPv4(address) && address !== this.config.address) {
        this.config.address = address;
        this.setStoreValue("config", this.config).catch(this.error);
      }
    });

    client.on("values", (values: Record<string, unknown>) => {
      if (!isCurrent()) return;
      this.applyValues(values).catch(this.error);
    });

    client.on("description", (changed: string[]) => {
      if (!isCurrent()) return;
      const described = changed.map(
        (name) => `${name} (${describeFeatureState(this.findFeature(name))})`,
      );
      this.log(`description changed: ${described.join(", ")}`);
      // No syncCapabilities() here, see capabilitySyncFeatures.
      this.scheduleValueRefresh();
    });

    client.on("close", (code: number, reason: string) => {
      if (!isCurrent()) return;
      const handshakeDone = client.handshakeDone;
      const classified = classifyClose(code, reason, {
        handshakeDone,
        lastError: client.lastError,
      });
      this.log(
        `[conn] websocket closed code=${code} reason=${reason || "-"} ` +
          `handshake=${handshakeDone ? "done" : "not finished"} lastError=${client.lastError?.message ?? "-"}`,
      );
      const connectedForMs = this.connectedAt ? Date.now() - this.connectedAt : 0;
      this.connectedAt = 0;
      if (retryQuietly(classified.reason, { handshakeDone, connectedForMs })) {
        this.log(`[conn] reconnecting in ${QUIET_RETRY_MS / 1000}s, staying available`);
        this.app.connectionStatus.setState(this.haId, "connecting");
        this.scheduleReconnect(QUIET_RETRY_MS);
        return;
      }
      this.markUnavailable(classified.reason, classified.detail);
    });

    client.on("error", (err: Error) => {
      if (!isCurrent()) return;
      this.error("[conn] client error:", err.message);
    });

    try {
      await client.connect();
    } catch (err) {
      if (!isCurrent()) return;
      const classified = classifyError(err);
      this.error(`[conn] connect failed: ${(err as Error).message}`);
      this.markUnavailable(classified.reason, classified.detail);
    }
  }

  private markUnavailable(reason: ConnectionReason, detail: string): void {
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempts++;
    this.log(`[conn] unavailable: ${reason} (${detail || "-"}); retry in ${delay / 1000}s`);
    this.app.connectionStatus.setState(this.haId, "unavailable", { reason, detail });
    this.setUnavailable(this.homey.__(`device.unavailable.${reason}`)).catch(this.error);
    this.scheduleReconnect(delay);
  }

  private async applyValues(values: Record<string, unknown>): Promise<void> {
    const wasRunning = this.isProgramRunning();
    for (const [name, raw] of Object.entries(values)) {
      // Some dishwashers report the program roots as "001"; BaseProgram has the readable name.
      if (name === "BSH.Common.Option.BaseProgram" && typeof raw === "string" && raw.trim()) {
        const fallback = decodeLastSegment(raw);
        const isNumericProgramId = (value: unknown): boolean =>
          typeof value === "string" && /^\d+$/.test(value);

        if (
          this.hasCapability("homeconnect_program") &&
          isNumericProgramId(this.getCapabilityValue("homeconnect_program"))
        ) {
          await this.setCapabilityValue("homeconnect_program", fallback as never).catch(this.error);
        }

        if (
          this.hasCapability("homeconnect_selected_program") &&
          isNumericProgramId(this.getCapabilityValue("homeconnect_selected_program"))
        ) {
          await this.setCapabilityValue("homeconnect_selected_program", fallback as never).catch(this.error);
        }
      }

      if (name.includes(".Event.")) {
        this.handleEvent(name, raw);
        continue;
      }

      const mapping = CAPABILITY_MAP[name];
      if (!mapping || !this.hasCapability(mapping.capability)) continue;

      // Keep the readable BaseProgram name over a numeric "001" (see above).
      if (
        (name === "BSH.Common.Root.ActiveProgram" || name === "BSH.Common.Root.SelectedProgram") &&
        typeof raw === "string" &&
        /^\d+$/.test(raw) &&
        this.getCapabilityValue(mapping.capability)
      ) {
        continue;
      }

      if (RUNNING_ONLY_FEATURES.has(name) && !this.isProgramRunning()) continue;

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
      if (Object.values(DERIVED_CAPABILITIES).includes(mapping.capability)) {
        await this.updateDerivedCapabilities();
      }

      const mirror = NUMERIC_MIRRORS[mapping.capability];
      if (mirror && this.hasCapability(mirror)) {
        const numeric = decodeEnumToNumber(raw);
        if (numeric !== this.getCapabilityValue(mirror)) {
          await this.setCapabilityValue(mirror, numeric as never).catch(this.error);
        }
      }
    }
    if (wasRunning && !this.isProgramRunning()) await this.applyIdleValues();
    this.reconcileDerivedState();
    await this.onValuesApplied(values);
  }

  protected async onValuesApplied(_values: Record<string, unknown>): Promise<void> {}

  // Fires on the edge to "Present" and acknowledges, or the appliance keeps re-sending it.
  private handleEvent(featureName: string, raw: unknown): void {
    const previous = this.eventStates.get(featureName);
    this.eventStates.set(featureName, raw);
    if (raw !== "Present" || previous === "Present") return;
    const driver = this.driver as TriggerDriver;
    const spec = this.eventMap()[featureName];
    if (spec && "ignore" in spec) {
      this.log(`[event] ${featureName} ignored`);
      return;
    }
    if (spec) {
      const trigger = this.driverTrigger(spec.triggerKey);
      if (trigger) {
        const tokens = spec.tokens ? spec.tokens(featureName) : {};
        trigger.trigger(this, tokens, {}).catch(this.error);
      } else {
        this.error(`event ${featureName} mapped to unknown trigger ${spec.triggerKey}`);
      }
    } else if (driver.errorOccurredTrigger) {
      const code = featureName.split(".").pop() ?? featureName;
      driver.errorOccurredTrigger.trigger(this, { error_code: code }, {}).catch(this.error);
    }
    this.acknowledgeEvent();
  }

  private acknowledgeEvent(): void {
    const uid = this.findUid("BSH.Common.Command.AcknowledgeEvent");
    if (uid == null) return;
    const feature = this.config.features?.[String(uid)];
    if (!isFeatureWritableNow(feature)) return;
    this.client?.setValue(uid, true).catch((err) => {
      // Some appliances reject it once the event has cleared by itself.
      this.log(`AcknowledgeEvent ignored: ${(err as Error).message}`);
    });
  }

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
    this.fireMappedChangeTrigger(capability, value);
  }

  // Deduplicated: a tile write is reported by Homey and again by the appliance.
  protected fireMappedChangeTrigger(capability: string, value: unknown): void {
    const row = Object.values(CAPABILITY_MAP).find((e) => e.capability === capability && e.trigger);
    if (!row?.trigger) return;
    if (this.lastTriggeredValues.get(capability) === value) return;
    this.lastTriggeredValues.set(capability, value);
    this.driverTrigger(row.trigger.key)?.trigger(this, { [row.trigger.token]: String(value) }, {}).catch(this.error);
  }

  private async applyIdleValues(): Promise<void> {
    for (const entry of Object.values(CAPABILITY_MAP)) {
      if (entry.idleValue === undefined || !this.hasCapability(entry.capability)) continue;
      if (this.getCapabilityValue(entry.capability) === entry.idleValue) continue;
      try {
        await this.setCapabilityValue(entry.capability, entry.idleValue as never);
      } catch (err) {
        this.error(err);
        continue;
      }
      this.fireTriggers(entry.capability, entry.idleValue);
    }
  }

  protected driverTrigger(key: string): Homey.FlowCardTriggerDevice | undefined {
    return (this.driver as unknown as Record<string, Homey.FlowCardTriggerDevice | undefined>)[
      `${key}Trigger`
    ];
  }

  protected isProgramRunning(): boolean {
    const state = this.getCapabilityValue("homeconnect_operation_state");
    const power = this.getCapabilityValue("onoff");
    return power !== false && typeof state === "string" && RUNNING_STATES.has(state);
  }

  // The appliance stops sending progress once it stops running, so the last values would freeze.
  private reconcileDerivedState(): void {
    if (this.isProgramRunning()) return;

    const clear = (capability: string, value: unknown): void => {
      if (this.hasCapability(capability) && this.getCapabilityValue(capability) !== value) {
        this.setCapabilityValue(capability, value as never).catch(this.error);
      }
    };
    clear("homeconnect_program_progress", null);
    clear("homeconnect_remaining_time", null);
    clear("homeconnect_remaining_time_display", null);
    clear("homeconnect_elapsed_time", null);
    clear("homeconnect_start_in_relative", null);
    clear("homeconnect_program_phase", "None");
    // Keep the program name on "Finished" so the user can still see what ran.
    if (this.getCapabilityValue("homeconnect_operation_state") !== "Finished") {
      clear("homeconnect_program", null);
    }
  }

  listPrograms(query = ""): Array<{ name: string; id: string }> {
    const q = query.trim().toLowerCase();
    return Object.values(this.config.features ?? {})
      .map((f) => f.name)
      .filter((name): name is string => typeof name === "string" && name.includes(".Program."))
      .map((name) => ({ name: prettify(name.split(".").pop() as string), id: name }))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async startProgram(
    programName: string,
    opts: { temperature?: number; duration?: number; delayMinutes?: number } = {},
  ): Promise<void> {
    // Legacy oven extras are best-effort: skipped when the model lacks them.
    const options: Record<string, unknown> = {};
    const setpoint = "Cooking.Oven.Option.SetpointTemperature";
    if (opts.temperature != null && this.findUid(setpoint) != null) {
      options[setpoint] = Math.round(opts.temperature);
    }
    if (opts.duration != null && this.findUid("BSH.Common.Option.Duration") != null) {
      options["BSH.Common.Option.Duration"] = Math.round(opts.duration * 60);
    }
    if (opts.delayMinutes != null && opts.delayMinutes > 0) {
      options["BSH.Common.Option.StartInRelative"] = Math.round(opts.delayMinutes * 60);
    }
    await this.startProgramWithOptions(programName, options);
  }

  async startSelectedProgram(): Promise<void> {
    let programUid = this.client?.selectedProgramUid ?? null;
    if (programUid == null) {
      const selected = this.getCapabilityValue("homeconnect_selected_program");
      if (typeof selected === "string" && selected) {
        const match = this.listPrograms().find((p) => p.id.split(".").pop() === selected);
        if (match) programUid = this.findUid(match.id);
      }
    }
    if (programUid == null) {
      throw new Error(this.homey.__("device.error.no_selected_program"));
    }
    this.assertCanStartRemotely();
    if (!this.client) throw new Error("not connected");
    const name = this.config.features?.[String(programUid)]?.name ?? String(programUid);
    this.log(`startSelectedProgram ${name} uid=${programUid}`);
    // No options: the appliance keeps the options already set for the selection.
    await this.client.startProgram(programUid, []);
  }

  private assertCanStartRemotely(): void {
    if (this.getCapabilityValue("homeconnect_remote_start") === false) {
      throw new Error(this.homey.__("device.error.remote_start_not_allowed"));
    }
    if (this.getCapabilityValue("homeconnect_door_state") === "Open") {
      throw new Error(this.homey.__("device.error.door_open"));
    }
  }

  // Options the appliance lacks are an error, so callers drop optional ones first.
  async startProgramWithOptions(
    programName: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const programUid = this.findUid(programName);
    if (programUid == null) throw new Error(this.homey.__("device.error.unknown_program"));
    this.assertCanStartRemotely();

    const wire: Array<{ uid: number; value: unknown }> = [];
    for (const [featureName, value] of Object.entries(options)) {
      const uid = this.findUid(featureName);
      if (uid == null) throw new Error(this.homey.__("device.error.feature_not_supported"));
      const encoded = this.encodeForFeature(uid, value);
      if (encoded == null) throw new Error(this.homey.__("device.error.invalid_value"));
      wire.push({ uid, value: encoded });
    }

    if (!this.client) throw new Error("not connected");
    this.log(`startProgram ${programName} uid=${programUid} options=${JSON.stringify(wire)}`);
    await this.client.startProgram(programUid, wire);
  }

  async selectProgram(programName: string): Promise<void> {
    const programUid = this.findUid(programName);
    if (programUid == null) throw new Error(this.homey.__("device.error.unknown_program"));
    if (!this.client) throw new Error("not connected");
    this.log(`selectProgram ${programName} uid=${programUid}`);
    await this.client.selectProgram(programUid, []);
  }

  async sendCommand(command: "AbortProgram" | "PauseProgram" | "ResumeProgram"): Promise<void> {
    const uid = this.findUid(`BSH.Common.Command.${command}`);
    if (uid == null) throw new Error(`This appliance does not support ${command}`);
    this.assertFeatureWritableNow(this.config.features?.[String(uid)]);
    if (!this.client) throw new Error("not connected");
    this.log(`sendCommand ${command} uid=${uid}`);
    await this.client.setValue(uid, true);
  }

  // Doesn't set the capability: the appliance reports the new value itself.
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

  async setSettingValue(featureName: string, value: unknown): Promise<void> {
    const uid = this.findUid(featureName);
    if (uid == null) {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
    this.assertFeatureWritableNow(this.config.features?.[String(uid)]);
    const encoded = this.encodeForFeature(uid, value);
    if (encoded == null) throw new Error(this.homey.__("device.error.invalid_value"));
    if (!this.client) {
      throw new Error("not connected");
    }
    this.log(`setSettingValue ${featureName} uid=${uid} value=${JSON.stringify(encoded)}`);
    await this.client.setValue(uid, encoded);
  }

  private encodeForFeature(uid: number, value: unknown): unknown {
    const feature = this.config.features?.[String(uid)];
    return feature?.values && typeof value === "string" ? encodeEnumIndex(value, feature) : value;
  }

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

  protected findUid(featureName: string): number | null {
    const features = this.config.features ?? {};
    for (const [uid, descriptor] of Object.entries(features)) {
      if (descriptor.name === featureName) return Number(uid);
    }
    return null;
  }

  protected findFeature(
    featureName: string,
    features: Record<string, FeatureDescriptor> = this.config.features ?? {},
  ): FeatureDescriptor | undefined {
    for (const descriptor of Object.values(features)) {
      if (descriptor.name === featureName) return descriptor;
    }
    return undefined;
  }

  private assertFeatureWritableNow(feature?: FeatureDescriptor): void {
    if (!isFeatureWritableNow(feature)) {
      this.log(`[write] ${feature?.name ?? "?"} not writable now (${describeFeatureState(feature)})`);
      throw new Error(this.homey.__("device.error.feature_not_available"));
    }
  }

  // Without this, a write our own checks refuse leaves no trace in a diagnostics report.
  registerCapabilityListener(capability: string, listener: Homey.Device.CapabilityCallback): void {
    super.registerCapabilityListener(capability, async (value, opts) => {
      const write = `${capability} -> ${JSON.stringify(value)}`;
      this.log(`[write] ${write}`);
      try {
        return await listener(value, opts);
      } catch (err) {
        this.error(`[write] ${write} failed: ${(err as Error).message}`);
        throw err;
      }
    });
  }

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

  private scheduleReconnect(delayMs: number): void {
    this.clearReconnect();
    this.reconnectTimer = this.homey.setTimeout(() => {
      this.connect().catch(this.error);
    }, delayMs);
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

  onDiscoveryResult(result: Homey.DiscoveryResult): boolean {
    // Homey may ask before onInit has loaded the config.
    const haId = this.config?.haId ?? String(this.getData().id);
    return matchMdnsResult(result as never, haId).matched;
  }

  async onDiscoveryAvailable(result: Homey.DiscoveryResult): Promise<void> {
    if (!this.config?.key) return;
    const address = (result as { address?: string }).address;
    // Only pin IPv4: link-local IPv6 addresses aren't usable without a scope id.
    if (!address || !net.isIPv4(address)) return;
    const via = matchMdnsResult(result as never, this.haId).via;
    this.app.connectionStatus.recordMdns(this.haId, address, via);
    const changed = address !== this.config.address;
    if (changed) {
      this.log(`[mdns] appliance seen at ${address} via ${via ?? "?"} (was ${this.config.address ?? "-"})`);
      this.config.address = address;
      await this.setStoreValue("config", this.config);
    }
    const waitingToRetry = this.reconnectTimer != null;
    const elsewhere = this.client?.handshakeDone === true && this.client.address !== address;
    if (waitingToRetry || elsewhere) {
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
    this.app.connectionStatus.forget(this.haId);
    this.stopped = true;
    this.connectionGeneration++;
    this.clearReconnect();
    this.clearValueRefresh();
    this.client?.close();
    this.client = null;
  }
}

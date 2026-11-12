"use strict";

import Homey from "homey";

import { DeviceConfig } from "./types";
import { ApplianceDevice, EventTriggerSpec } from "./appliance-device";

/**
 * Base class shared by every appliance driver (oven, dishwasher, ...).
 *
 * Pairing is trivial: the one-time cloud key-exchange happens in the app's
 * settings page (see settings/ + api.ts) and stores the discovered
 * DeviceConfig[] on the app instance. onPairListDevices() surfaces just the
 * subset matching this driver's appliance type.
 *
 * Flow cards live in each driver's driver.flow.compose.json with a per-driver
 * id prefix (e.g. "oven_start_program"), because Homey flow-card ids must be
 * unique app-wide. A subclass declares `applianceType` and `cardPrefix`;
 * everything below is shared - the subclass only adds an `eventMap` if it
 * wants per-appliance event triggers.
 */
export abstract class ApplianceDriver extends Homey.Driver {
  /** The DeviceDescription.type this driver pairs, e.g. "Oven", "Dishwasher". */
  protected abstract readonly applianceType: string;
  /** Prefix of this driver's flow-card ids, e.g. "oven", "dishwasher". */
  protected abstract readonly cardPrefix: string;

  // --- triggers (fired from ApplianceDevice) ---
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
  aquaStopOccurredTrigger?: Homey.FlowCardTriggerDevice;
  lowWaterPressureTrigger?: Homey.FlowCardTriggerDevice;
  softwareUpdateAvailableTrigger?: Homey.FlowCardTriggerDevice;

  async onInit(): Promise<void> {
    this.registerStandardTriggers();
    this.registerStandardConditions();
    this.registerStandardActions();
    this.registerEventTriggers();
    this.log(`${this.constructor.name} initialized`);
  }

  private flowCardIds?: Set<string>;

  /**
   * Look up a flow card, or null when the app manifest doesn't declare it.
   * Not every appliance has every shared card (a hood has no door or child
   * lock). Only a missing id is skipped: a declared card that fails to load
   * still throws, so typos don't go silent.
   */
  protected optionalCard<T>(id: string, lookup: () => T): T | null {
    if (!this.flowCardIds) {
      const flow = (this.homey.manifest as { flow?: Record<string, Array<{ id: string }>> }).flow;
      this.flowCardIds = new Set(Object.values(flow ?? {}).flatMap((cards) => cards.map((c) => c.id)));
    }
    return this.flowCardIds.has(id) ? lookup() : null;
  }

  // --- subclass extension points ------------------------------------------

  /**
   * Per-driver map of event feature names → trigger key. The trigger key
   * matches a `<key>Trigger` property registered on this driver (see
   * registerEventTriggers below). Default is empty; the device falls back to
   * `errorOccurredTrigger` for unmapped events.
   */
  protected eventMap(): Record<string, EventTriggerSpec> {
    return {};
  }

  /** ApplianceDevice consults this via `(driver as TriggerDriver).getEventMap?.()`. */
  getEventMap(): Record<string, EventTriggerSpec> {
    return this.eventMap();
  }

  // --- trigger registration -----------------------------------------------

  private registerStandardTriggers(): void {
    const p = this.cardPrefix;
    const get = (id: string): Homey.FlowCardTriggerDevice | undefined =>
      this.optionalCard(`${p}_${id}`, () => this.homey.flow.getDeviceTriggerCard(`${p}_${id}`)) ??
      undefined;

    this.programFinishedTrigger = get("program_finished");
    this.doorChangedTrigger = get("door_changed");
    this.operationStateChangedTrigger = get("operation_state_changed");
    this.programProgressChangedTrigger = get("program_progress_changed");
    this.programStartedTrigger = get("program_started");
    this.programAbortedTrigger = get("program_aborted");
    this.doorOpenedTrigger = get("door_opened");
    this.doorClosedTrigger = get("door_closed");
    this.remoteStartAllowedChangedTrigger = get("remote_start_allowed_changed");
    this.remoteControlActiveChangedTrigger = get("remote_control_active_changed");
    this.localControlChangedTrigger = get("local_control_changed");
    this.remainingTimeChangedTrigger = get("remaining_time_changed");
    this.elapsedTimeChangedTrigger = get("elapsed_time_changed");
    this.childLockChangedTrigger = get("child_lock_changed");
    this.errorOccurredTrigger = get("error_occurred");
    this.aquaStopOccurredTrigger = get("aqua_stop_occurred");
    this.lowWaterPressureTrigger = get("low_water_pressure");
    this.softwareUpdateAvailableTrigger = get("software_update_available");
  }

  /**
   * For each entry in the subclass's eventMap, attach the corresponding
   * trigger card from the manifest. Card id == `<prefix>_<trigger_key>` in
   * snake_case (we accept eventMap triggerKey in either camel or snake).
   */
  private registerEventTriggers(): void {
    const seen = new Set<string>();
    for (const spec of Object.values(this.eventMap())) {
      if (seen.has(spec.triggerKey)) continue;
      seen.add(spec.triggerKey);
      const snake = spec.triggerKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      const cardId = `${this.cardPrefix}_${snake}`;
      const trigger = this.optionalCard(cardId, () => this.homey.flow.getDeviceTriggerCard(cardId));
      if (!trigger) continue;
      (this as unknown as Record<string, Homey.FlowCardTriggerDevice>)[
        `${spec.triggerKey}Trigger`
      ] = trigger;
    }
  }

  // --- conditions ---------------------------------------------------------

  private registerStandardConditions(): void {
    const p = this.cardPrefix;
    const cond = (id: string): Homey.FlowCardCondition | null =>
      this.optionalCard(`${p}_${id}`, () => this.homey.flow.getConditionCard(`${p}_${id}`));

    cond("is_running")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_operation_state") === "Run",
    );
    cond("is_finished")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_operation_state") === "Finished",
    );
    cond("is_paused")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_operation_state") === "Pause",
    );
    cond("is_inactive")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) => {
        const s = device.getCapabilityValue("homeconnect_operation_state");
        return s === "Inactive" || s === "Ready";
      },
    );
    cond("is_in_delayed_start")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_operation_state") === "DelayedStart",
    );
    cond("has_error")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_operation_state") === "Error",
    );
    cond("door_is_open")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_door_state") === "Open",
    );
    cond("remote_start_allowed")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_remote_start") === true,
    );
    cond("remote_control_is_active")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_remote_control_active") === true,
    );
    cond("local_control_is_active")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_local_control_active") === true,
    );
    cond("child_lock_is_on")?.registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_child_lock") === true,
    );
    cond("remaining_time_below")?.registerRunListener(
      async ({ device, minutes }: { device: Homey.Device; minutes: number }) => {
        const v = device.getCapabilityValue("homeconnect_remaining_time");
        return typeof v === "number" && v < minutes;
      },
    );
    cond("program_progress_above")?.registerRunListener(
      async ({ device, percent }: { device: Homey.Device; percent: number }) => {
        const v = device.getCapabilityValue("homeconnect_program_progress");
        return typeof v === "number" && v > percent;
      },
    );

    const currentProgram = cond("current_program_is");
    currentProgram?.registerRunListener(
      async ({ device, program }: { device: Homey.Device; program: { id: string } }) =>
        device.getCapabilityValue("homeconnect_program") === program.id.split(".").pop(),
    );
    currentProgram?.registerArgumentAutocompleteListener("program", async (query, args) =>
      (args.device as ApplianceDevice).listPrograms(query),
    );

    const selectedProgram = cond("selected_program_is");
    selectedProgram?.registerRunListener(
      async ({ device, program }: { device: Homey.Device; program: { id: string } }) =>
        device.getCapabilityValue("homeconnect_selected_program") ===
        program.id.split(".").pop(),
    );
    selectedProgram?.registerArgumentAutocompleteListener("program", async (query, args) =>
      (args.device as ApplianceDevice).listPrograms(query),
    );
  }

  // --- actions ------------------------------------------------------------

  private registerStandardActions(): void {
    const p = this.cardPrefix;
    const action = (id: string): Homey.FlowCardAction | null =>
      this.optionalCard(`${p}_${id}`, () => this.homey.flow.getActionCard(`${p}_${id}`));

    const startProgram = action("start_program");
    startProgram?.registerRunListener(
      async (args: {
        device: Homey.Device;
        program: { id: string };
        temperature?: number;
        duration?: number;
      }) =>
        (args.device as ApplianceDevice).startProgram(args.program.id, {
          temperature: args.temperature,
          duration: args.duration,
        }),
    );
    startProgram?.registerArgumentAutocompleteListener("program", async (query, args) =>
      (args.device as ApplianceDevice).listPrograms(query),
    );

    const startDelayed = action("start_program_delayed");
    startDelayed?.registerRunListener(
      async (args: {
        device: Homey.Device;
        program: { id: string };
        delay_minutes: number;
      }) =>
        (args.device as ApplianceDevice).startProgram(args.program.id, {
          delayMinutes: args.delay_minutes,
        }),
    );
    startDelayed?.registerArgumentAutocompleteListener("program", async (query, args) =>
      (args.device as ApplianceDevice).listPrograms(query),
    );

    action("start_selected_program")
      ?.registerRunListener(async ({ device }: { device: Homey.Device }) =>
        (device as ApplianceDevice).startSelectedProgram(),
      );

    const selectProgram = action("select_program");
    selectProgram?.registerRunListener(
      async (args: { device: Homey.Device; program: { id: string } }) =>
        (args.device as ApplianceDevice).selectProgram(args.program.id),
    );
    selectProgram?.registerArgumentAutocompleteListener("program", async (query, args) =>
      (args.device as ApplianceDevice).listPrograms(query),
    );

    action("stop_program")
      ?.registerRunListener(async ({ device }: { device: Homey.Device }) =>
        (device as ApplianceDevice).sendCommand("AbortProgram"),
      );
    action("pause_program")
      ?.registerRunListener(async ({ device }: { device: Homey.Device }) =>
        (device as ApplianceDevice).sendCommand("PauseProgram"),
      );
    action("resume_program")
      ?.registerRunListener(async ({ device }: { device: Homey.Device }) =>
        (device as ApplianceDevice).sendCommand("ResumeProgram"),
      );

    action("set_child_lock")
      ?.registerRunListener(
        async ({ device, enabled }: { device: Homey.Device; enabled: boolean }) =>
          (device as ApplianceDevice).setMappedCapabilityValue(
            "homeconnect_child_lock",
            enabled,
          ),
      );

    action("acknowledge_event")
      ?.registerRunListener(async ({ device }: { device: Homey.Device }) =>
        (device as ApplianceDevice).acknowledgeCurrentEvent(),
      );

    action("power_off")
      ?.registerRunListener(async ({ device }: { device: Homey.Device }) =>
        (device as ApplianceDevice).setMappedCapabilityValue("onoff", false),
      );
  }

  /**
   * Surface the appliances of this driver's type, discovered/imported via the
   * settings page. The payload is deliberately lean (name + data.id only) -
   * ApplianceDevice looks the full config up from homey.app on first init.
   */
  async onPairListDevices(): Promise<Array<{ name: string; data: { id: string } }>> {
    const all: DeviceConfig[] = (
      this.homey.app as unknown as { getDevices(): DeviceConfig[] }
    ).getDevices();
    const devices = all.filter(
      (cfg) =>
        (cfg.description?.type ?? "").toLowerCase() === this.applianceType.toLowerCase(),
    );
    this.log(
      `onPairListDevices: ${devices.length} ${this.applianceType}(s) of ${all.length} stored`,
    );
    if (all.length === 0) {
      throw new Error(this.homey.__("pair.no_devices"));
    }
    if (devices.length === 0) {
      // Appliances exist but none matches this driver's type string. Name
      // what we did find, so a mismatched type shows up in user reports.
      const types = [...new Set(all.map((cfg) => cfg.description?.type ?? "?"))].join(", ");
      this.log(`onPairListDevices: no ${this.applianceType}; stored types: ${types}`);
      throw new Error(
        this.homey.__("pair.no_devices_of_type", { type: this.applianceType, types }),
      );
    }
    return devices.map((cfg) => ({
      name: `${cfg.description.brand} ${cfg.description.type}`,
      data: { id: cfg.haId as string },
    }));
  }
}

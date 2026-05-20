"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { ApplianceDevice, EventTriggerSpec } from "../../lib/appliance-device";

class OvenDriver extends ApplianceDriver {
  protected readonly applianceType = "Oven";
  protected readonly cardPrefix = "oven";

  // Per-event tokens for combined cards: variants share one trigger but the
  // token tells the user which sub-event fired.
  protected eventMap(): Record<string, EventTriggerSpec> {
    const preheat: EventTriggerSpec = {
      triggerKey: "preheatFinished",
      tokens: (name) => ({
        mode: name.includes("FastPreheat") ? "fast" : "regular",
      }),
    };
    const probeAlert = (kind: string): EventTriggerSpec => ({
      triggerKey: "meatProbeAttention",
      tokens: () => ({ kind }),
    });
    const doorAttn = (kind: string): EventTriggerSpec => ({
      triggerKey: "doorAttention",
      tokens: () => ({ kind }),
    });
    const insertFood = (when: string): EventTriggerSpec => ({
      triggerKey: "insertFood",
      tokens: () => ({ when }),
    });
    const turnFood = (when: string): EventTriggerSpec => ({
      triggerKey: "turnFood",
      tokens: () => ({ when }),
    });
    return {
      "Cooking.Oven.Event.Cavity.001.FastPreheatFinished": preheat,
      "Cooking.Oven.Event.Cavity.001.RegularPreheatFinished": preheat,
      "Cooking.Oven.Event.Cavity.001.AlarmClockElapsed": { triggerKey: "alarmClockElapsed" },
      "Cooking.Oven.Event.Cavity.001.MeatprobeTemperatureReached": {
        triggerKey: "meatProbeTempReached",
      },
      "Cooking.Oven.Event.Cavity.001.MeatprobeNecessary": probeAlert("necessary"),
      "Cooking.Oven.Event.Cavity.001.MaxMeatprobeTemperatureExceeded": probeAlert("max_exceeded"),
      "Cooking.Oven.Event.Cavity.001.UnplugMeatprobe": probeAlert("unplug"),
      "Cooking.Oven.Event.Cavity.001.InsertFoodNow": insertFood("now"),
      "Cooking.Oven.Event.Cavity.001.InsertFoodLater": insertFood("later"),
      "Cooking.Oven.Event.Cavity.001.TurnFoodNow": turnFood("now"),
      "Cooking.Oven.Event.Cavity.001.TurnFoodLater": turnFood("later"),
      "Cooking.Oven.Event.Cavity.001.OpenDoor": doorAttn("open"),
      "Cooking.Oven.Event.Cavity.001.CloseDoor": doorAttn("close"),
      "Cooking.Oven.Event.Cavity.001.LeaveDoorOpen": doorAttn("leave_open"),
      "Cooking.Oven.Event.Cavity.001.OpenDoorInfrequently": doorAttn("open_infrequently"),
      "Cooking.Oven.Event.Cavity.001.CavityTemperatureTooHigh": {
        triggerKey: "cavityTempTooHigh",
      },
      "Cooking.Oven.Event.Cavity.001.EasyClean": { triggerKey: "easyCleanRequired" },
      "Cooking.Oven.Event.Cavity.001.PyrolysisRemoveTank": {
        triggerKey: "pyrolysisRemoveTank",
      },
      "Cooking.Oven.Event.Cavity.001.SubsequentCookingRequest": {
        triggerKey: "subsequentCookingRequest",
      },
      "Cooking.Oven.Event.Cavity.001.OperatingTimeLimitReached": {
        triggerKey: "operatingTimeLimitReached",
      },
      "Cooking.Oven.Event.Cavity.001.OvenLockWhileCoolingDown": {
        triggerKey: "coolingLockActive",
      },
      "BSH.Common.Event.AquaStopOccured": { triggerKey: "aquaStopOccurred" },
      "BSH.Common.Event.LowWaterPressure": { triggerKey: "lowWaterPressure" },
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
    };
  }

  async onInit(): Promise<void> {
    await super.onInit();

    const action = (id: string): Homey.FlowCardAction =>
      this.homey.flow.getActionCard(`oven_${id}`);
    const cond = (id: string): Homey.FlowCardCondition =>
      this.homey.flow.getConditionCard(`oven_${id}`);

    // Oven-specific actions all just write a capability the user can also
    // tweak from the device tile; the action exists so it's first-class in
    // the Flow editor.
    action("set_target_temperature").registerRunListener(
      async ({ device, celsius }: { device: Homey.Device; celsius: number }) =>
        (device as ApplianceDevice).setSettingValue(
          "Cooking.Oven.Option.SetpointTemperature",
          Math.round(celsius),
        ),
    );
    action("set_meat_probe_target").registerRunListener(
      async ({ device, celsius }: { device: Homey.Device; celsius: number }) =>
        (device as ApplianceDevice).setMappedCapabilityValue(
          "homeconnect_meat_probe_target",
          celsius,
        ),
    );
    action("set_alarm_clock").registerRunListener(
      async ({ device, minutes }: { device: Homey.Device; minutes: number }) =>
        (device as ApplianceDevice).setMappedCapabilityValue(
          "homeconnect_alarm_clock",
          minutes,
        ),
    );
    action("set_cavity_light").registerRunListener(
      async ({ device, enabled }: { device: Homey.Device; enabled: boolean }) =>
        (device as ApplianceDevice).setMappedCapabilityValue(
          "homeconnect_cavity_light",
          enabled,
        ),
    );
    action("set_fast_preheat").registerRunListener(
      async ({ device, enabled }: { device: Homey.Device; enabled: boolean }) =>
        (device as ApplianceDevice).setMappedCapabilityValue(
          "homeconnect_fast_preheat",
          enabled,
        ),
    );

    cond("meat_probe_is_plugged").registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_meat_probe_plugged") === true,
    );
    cond("cavity_temperature_above").registerRunListener(
      async ({ device, celsius }: { device: Homey.Device; celsius: number }) => {
        const v = device.getCapabilityValue("measure_temperature");
        return typeof v === "number" && v > celsius;
      },
    );
    cond("meat_probe_temperature_above").registerRunListener(
      async ({ device, celsius }: { device: Homey.Device; celsius: number }) => {
        const v = device.getCapabilityValue("homeconnect_meat_probe_temp");
        return typeof v === "number" && v > celsius;
      },
    );
    cond("target_temperature_above").registerRunListener(
      async ({ device, celsius }: { device: Homey.Device; celsius: number }) => {
        const v = device.getCapabilityValue("target_temperature");
        return typeof v === "number" && v > celsius;
      },
    );
    cond("fast_preheat_is_on").registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_fast_preheat") === true,
    );
    cond("cavity_light_is_on").registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_cavity_light") === true,
    );
  }
}

module.exports = OvenDriver;

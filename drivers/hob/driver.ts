"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { ApplianceDevice, EventSpec } from "../../lib/appliance-device";

type Hob = ApplianceDevice & {
  isCooking(): boolean;
  isZoneCooking(zone: string): boolean;
};

class HobDriver extends ApplianceDriver {
  cookingStartedTrigger?: Homey.FlowCardTriggerDevice;
  cookingStoppedTrigger?: Homey.FlowCardTriggerDevice;
  zoneChangedTrigger?: Homey.FlowCardTriggerDevice;

  protected readonly applianceType = "Hob";
  protected readonly cardPrefix = "hob";

  protected eventMap(): Record<string, EventSpec> {
    const ignore: EventSpec = { ignore: true };
    return {
      "Cooking.Common.Event.ApplianceOverheated": { triggerKey: "overheated" },
      "Cooking.Hob.Event.Error.OperatingTimeLimitReached": { triggerKey: "operatingTimeLimitReached" },
      "Cooking.Common.Event.PreheatFinished": { triggerKey: "preheatFinished" },
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
      // Everyday hob notifications, not errors (a zone timer or the minute minder running out).
      "BSH.Common.Event.ProgramFinished": ignore,
      "BSH.Common.Event.AlarmClockElapsed": ignore,
      "BSH.Common.Event.SoftwareDownloadAvailable": ignore,
      "BSH.Common.Event.SoftwareUpdateSuccessful": ignore,
      "BSH.Common.Event.DemoModeRunning": ignore,
      "BSH.Common.Event.ConnectLocalWiFi": ignore,
      "BSH.Common.Event.CustomerServiceRequest": ignore,
      "BSH.Common.Event.Favorite.001.ExternalTrigger": ignore,
      "BSH.Common.Event.Favorite.002.ExternalTrigger": ignore,
      "Cooking.Common.Event.ConfirmActionAtAppliance": ignore,
      "Cooking.Hob.Event.Error.MaxNumberBLEGadgets": ignore,
      "Cooking.Hob.Event.Error.BLEGadgetNeedsPairing": ignore,
    };
  }

  async onInit(): Promise<void> {
    await super.onInit();

    const trigger = (id: string): Homey.FlowCardTriggerDevice =>
      this.homey.flow.getDeviceTriggerCard(`hob_${id}`);
    const condition = (id: string): Homey.FlowCardCondition =>
      this.homey.flow.getConditionCard(`hob_${id}`);

    this.cookingStartedTrigger = trigger("cooking_started");
    this.cookingStoppedTrigger = trigger("cooking_stopped");
    this.zoneChangedTrigger = trigger("zone_changed");
    this.zoneChangedTrigger.registerRunListener(
      async ({ zone }: { zone: string }, state: { zone: string }) =>
        zone === "any" || zone === state.zone,
    );

    condition("is_cooking").registerRunListener(async ({ device }: { device: Hob }) =>
      device.isCooking(),
    );
    condition("zone_is_cooking").registerRunListener(
      async ({ device, zone }: { device: Hob; zone: string }) => device.isZoneCooking(zone),
    );
  }
}

module.exports = HobDriver;

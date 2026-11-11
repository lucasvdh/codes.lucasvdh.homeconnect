"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { ApplianceDevice, EventTriggerSpec } from "../../lib/appliance-device";

type Hood = ApplianceDevice & {
  setVentingLevel(level: string): Promise<void>;
  setIntensiveLevel(level: string): Promise<void>;
  startAutomatic(): Promise<void>;
  startDelayedShutOff(): Promise<void>;
};

class HoodDriver extends ApplianceDriver {
  /** Fired by ApplianceDevice.fireTriggers when the fan stage changes. */
  ventingLevelChangedTrigger?: Homey.FlowCardTriggerDevice;

  protected readonly applianceType = "Hood";
  protected readonly cardPrefix = "hood";

  protected eventMap(): Record<string, EventTriggerSpec> {
    return {
      "Cooking.Common.Event.Hood.GreaseFilterMaxSaturationNearlyReached": {
        triggerKey: "greaseFilterNearlySaturated",
      },
      "Cooking.Common.Event.Hood.GreaseFilterMaxSaturationReached": {
        triggerKey: "greaseFilterSaturated",
      },
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
    };
  }

  async onInit(): Promise<void> {
    await super.onInit();

    this.ventingLevelChangedTrigger = this.homey.flow.getDeviceTriggerCard(
      "hood_venting_level_changed",
    );

    const action = (id: string): Homey.FlowCardAction => this.homey.flow.getActionCard(`hood_${id}`);
    const condition = (id: string): Homey.FlowCardCondition =>
      this.homey.flow.getConditionCard(`hood_${id}`);

    action("set_venting_level").registerRunListener(
      async ({ device, level }: { device: Hood; level: string }) => device.setVentingLevel(level),
    );
    action("set_intensive_level").registerRunListener(
      async ({ device, level }: { device: Hood; level: string }) => device.setIntensiveLevel(level),
    );
    action("start_automatic").registerRunListener(async ({ device }: { device: Hood }) =>
      device.startAutomatic(),
    );
    action("start_delayed_shutoff").registerRunListener(async ({ device }: { device: Hood }) =>
      device.startDelayedShutOff(),
    );
    action("set_light").registerRunListener(
      async ({ device, enabled }: { device: Hood; enabled: boolean }) =>
        device.setMappedCapabilityValue("homeconnect_light", enabled),
    );
    action("set_light_brightness").registerRunListener(
      async ({ device, brightness }: { device: Hood; brightness: number }) =>
        device.setMappedCapabilityValue("homeconnect_light_brightness", brightness),
    );
    action("set_ambient_light").registerRunListener(
      async ({ device, enabled }: { device: Hood; enabled: boolean }) =>
        device.setMappedCapabilityValue("homeconnect_ambient_light", enabled),
    );

    condition("venting_level_is").registerRunListener(
      async ({ device, level }: { device: Hood; level: string }) =>
        device.getCapabilityValue("homeconnect_venting_level") === level,
    );
    condition("light_is_on").registerRunListener(
      async ({ device }: { device: Hood }) => device.getCapabilityValue("homeconnect_light") === true,
    );
  }
}

module.exports = HoodDriver;

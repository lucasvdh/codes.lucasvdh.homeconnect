"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { ApplianceDevice, EventTriggerSpec } from "../../lib/appliance-device";

class DryerDriver extends ApplianceDriver {
  protected readonly applianceType = "Dryer";
  protected readonly cardPrefix = "dryer";

  protected eventMap(): Record<string, EventTriggerSpec> {
    return {
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
    };
  }

  async onInit(): Promise<void> {
    await super.onInit();

    this.homey.flow.getActionCard("dryer_set_drying_target").registerRunListener(
      async ({ device, value }: { device: Homey.Device; value: string }) =>
        (device as ApplianceDevice).setMappedCapabilityValue("homeconnect_drying_target", value),
    );
  }
}

module.exports = DryerDriver;

"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { ApplianceDevice, EventTriggerSpec } from "../../lib/appliance-device";

class WasherDriver extends ApplianceDriver {
  protected readonly applianceType = "Washer";
  protected readonly cardPrefix = "washer";

  protected eventMap(): Record<string, EventTriggerSpec> {
    const idosLow = (dispenser: string): EventTriggerSpec => ({
      triggerKey: "idosLow",
      tokens: () => ({ dispenser }),
    });
    return {
      "LaundryCare.Washer.Event.IDos1FillLevelPoor": idosLow("1"),
      "LaundryCare.Washer.Event.IDos2FillLevelPoor": idosLow("2"),
      "BSH.Common.Event.AquaStopOccured": { triggerKey: "aquaStopOccurred" },
      "BSH.Common.Event.LowWaterPressure": { triggerKey: "lowWaterPressure" },
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
    };
  }

  async onInit(): Promise<void> {
    await super.onInit();

    const action = (id: string): Homey.FlowCardAction =>
      this.homey.flow.getActionCard(`washer_${id}`);
    const cond = (id: string): Homey.FlowCardCondition =>
      this.homey.flow.getConditionCard(`washer_${id}`);

    action("set_temperature").registerRunListener(
      async ({ device, value }: { device: Homey.Device; value: string }) =>
        (device as ApplianceDevice).setMappedCapabilityValue("homeconnect_wash_temperature", value),
    );
    action("set_spin_speed").registerRunListener(
      async ({ device, value }: { device: Homey.Device; value: string }) =>
        (device as ApplianceDevice).setMappedCapabilityValue("homeconnect_spin_speed", value),
    );
    action("set_idos").registerRunListener(
      async ({
        device, dispenser, enabled,
      }: { device: Homey.Device; dispenser: string; enabled: boolean }) =>
        (device as ApplianceDevice).setMappedCapabilityValue(
          `homeconnect_idos${dispenser}_active`,
          enabled,
        ),
    );

    cond("idos_is_active").registerRunListener(
      async ({ device, dispenser }: { device: Homey.Device; dispenser: string }) =>
        device.getCapabilityValue(`homeconnect_idos${dispenser}_active`) === true,
    );
  }
}

module.exports = WasherDriver;

"use strict";

import { ApplianceDevice } from "../../lib/appliance-device";

const VENTING_PROGRAM = "Cooking.Common.Program.Hood.Venting";
const AUTOMATIC_PROGRAM = "Cooking.Common.Program.Hood.Automatic";
const DELAYED_SHUTOFF_PROGRAM = "Cooking.Common.Program.Hood.DelayedShutOff";
const VENTING_LEVEL = "Cooking.Common.Option.Hood.VentingLevel";
const INTENSIVE_LEVEL = "Cooking.Common.Option.Hood.IntensiveLevel";
const ABORT_PROGRAM = "BSH.Common.Command.AbortProgram";

// The fan stage is an option of the running program, not a setting: picking one starts Venting
// unless it already runs.
class HoodDevice extends ApplianceDevice {
  async onInit(): Promise<void> {
    await super.onInit();
    if (this.hasCapability("homeconnect_venting_level")) {
      this.registerCapabilityListener("homeconnect_venting_level", async (value: unknown) => {
        await this.setVentingLevel(String(value));
        // Homey stores the value itself, so the appliance's report may skip the trigger.
        this.fireMappedChangeTrigger("homeconnect_venting_level", String(value));
      });
    }
    if (this.hasCapability("homeconnect_intensive_level")) {
      this.registerCapabilityListener("homeconnect_intensive_level", (value: unknown) =>
        this.setIntensiveLevel(String(value)),
      );
    }
  }

  async setVentingLevel(level: string): Promise<void> {
    if (level === "FanOff") {
      await this.stopFan();
    } else if (this.isRunning(VENTING_PROGRAM)) {
      await this.setSettingValue(VENTING_LEVEL, level);
    } else {
      await this.startProgramWithOptions(VENTING_PROGRAM, { [VENTING_LEVEL]: level });
    }
  }

  async setIntensiveLevel(level: string): Promise<void> {
    if (this.isProgramRunning()) {
      // The appliance rejects it for programs without the option; that error reaches the Flow.
      await this.setSettingValue(INTENSIVE_LEVEL, level);
    } else if (level !== "IntensiveStageOff") {
      await this.startProgramWithOptions(VENTING_PROGRAM, { [INTENSIVE_LEVEL]: level });
    }
  }

  async startAutomatic(): Promise<void> {
    await this.startProgramWithOptions(AUTOMATIC_PROGRAM);
  }

  async startDelayedShutOff(): Promise<void> {
    await this.startProgramWithOptions(DELAYED_SHUTOFF_PROGRAM);
  }

  private async stopFan(): Promise<void> {
    if (!this.isProgramRunning()) return;
    if (this.findUid(ABORT_PROGRAM) != null) {
      await this.sendCommand("AbortProgram");
    } else if (this.isRunning(VENTING_PROGRAM)) {
      // No AbortProgram on this model: dropping the stage ends Venting.
      await this.setSettingValue(VENTING_LEVEL, "FanOff");
    } else {
      throw new Error(this.homey.__("device.error.feature_not_supported"));
    }
  }

  private isRunning(programName: string): boolean {
    const active = this.getCapabilityValue("homeconnect_program");
    return this.isProgramRunning() && active === programName.split(".").pop();
  }
}

module.exports = HoodDevice;

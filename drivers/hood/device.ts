"use strict";

import { ApplianceDevice } from "../../lib/appliance-device";

const VENTING_PROGRAM = "Cooking.Common.Program.Hood.Venting";
const AUTOMATIC_PROGRAM = "Cooking.Common.Program.Hood.Automatic";
const DELAYED_SHUTOFF_PROGRAM = "Cooking.Common.Program.Hood.DelayedShutOff";
const VENTING_LEVEL = "Cooking.Common.Option.Hood.VentingLevel";
const INTENSIVE_LEVEL = "Cooking.Common.Option.Hood.IntensiveLevel";
const ABORT_PROGRAM = "BSH.Common.Command.AbortProgram";

/**
 * Extractor hood. The fan stage is not a setting but an option of the running
 * program: picking a stage changes the option while Venting runs, and
 * otherwise starts Venting at that stage (replacing Automatic or run-on).
 * "Off" stops whatever program runs.
 */
class HoodDevice extends ApplianceDevice {
  async onInit(): Promise<void> {
    await super.onInit();
    if (this.hasCapability("homeconnect_venting_level")) {
      this.registerCapabilityListener("homeconnect_venting_level", async (value: unknown) => {
        await this.setVentingLevel(String(value));
        // Homey stores the new value itself once this resolves, so the
        // appliance's own report may compare equal and skip the trigger.
        this.fireMappedChangeTrigger("homeconnect_venting_level", String(value));
      });
    }
    if (this.hasCapability("homeconnect_intensive_level")) {
      this.registerCapabilityListener("homeconnect_intensive_level", (value: unknown) =>
        this.setIntensiveLevel(String(value)),
      );
    }
  }

  /** "FanOff" or "FanStage01".."FanStage05". */
  async setVentingLevel(level: string): Promise<void> {
    if (level === "FanOff") {
      await this.stopFan();
    } else if (this.isRunning(VENTING_PROGRAM)) {
      await this.setSettingValue(VENTING_LEVEL, level);
    } else {
      await this.startProgramWithOptions(VENTING_PROGRAM, { [VENTING_LEVEL]: level });
    }
  }

  /** "IntensiveStageOff", "IntensiveStage1" or "IntensiveStage2". */
  async setIntensiveLevel(level: string): Promise<void> {
    if (this.isProgramRunning()) {
      // Change it on whatever program runs; the appliance rejects it when
      // that program doesn't take the option, which surfaces in the Flow.
      await this.setSettingValue(INTENSIVE_LEVEL, level);
    } else if (level !== "IntensiveStageOff") {
      await this.startProgramWithOptions(VENTING_PROGRAM, { [INTENSIVE_LEVEL]: level });
    }
    // Off while nothing runs: already off.
  }

  /** Let the hood pick the fan stage itself from its sensor. */
  async startAutomatic(): Promise<void> {
    await this.startProgramWithOptions(AUTOMATIC_PROGRAM);
  }

  /** Keep the fan running for the hood's run-on time, then switch off. */
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

"use strict";

import { ApplianceDevice } from "../../lib/appliance-device";

const VENTING_PROGRAM = "Cooking.Common.Program.Hood.Venting";
const AUTOMATIC_PROGRAM = "Cooking.Common.Program.Hood.Automatic";
const DELAYED_SHUTOFF_PROGRAM = "Cooking.Common.Program.Hood.DelayedShutOff";
const VENTING_LEVEL = "Cooking.Common.Option.Hood.VentingLevel";
const INTENSIVE_LEVEL = "Cooking.Common.Option.Hood.IntensiveLevel";
const ABORT_PROGRAM = "BSH.Common.Command.AbortProgram";

const PROGRAM_BY_MODE: Record<string, string> = {
  Venting: VENTING_PROGRAM,
  Automatic: AUTOMATIC_PROGRAM,
  DelayedShutOff: DELAYED_SHUTOFF_PROGRAM,
};

// The fan stage is an option of the running program, not a setting: picking one starts Venting
// unless it already runs.
class HoodDevice extends ApplianceDevice {
  async onInit(): Promise<void> {
    await super.onInit();
    // Not in CAPABILITY_MAP, so syncCapabilities won't add it to hoods paired earlier.
    if (!this.hasCapability("homeconnect_hood_mode") && this.findUid(VENTING_PROGRAM) != null) {
      await this.addCapability("homeconnect_hood_mode").catch(this.error);
    }
    if (this.hasCapability("homeconnect_hood_mode")) {
      this.registerCapabilityListener("homeconnect_hood_mode", (value: unknown) =>
        this.setMode(String(value)),
      );
      await this.syncModeFromProgram();
    }
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

  async setMode(mode: string): Promise<void> {
    if (mode === "Off") {
      await this.stopFan();
    } else if (mode === "Venting") {
      if (this.isRunning(VENTING_PROGRAM)) return;
      await this.startProgramWithOptions(VENTING_PROGRAM, {
        [VENTING_LEVEL]: this.currentOrLowestFanStage(),
      });
    } else if (PROGRAM_BY_MODE[mode]) {
      await this.startProgramWithOptions(PROGRAM_BY_MODE[mode]);
    } else {
      throw new Error(this.homey.__("device.error.invalid_value"));
    }
  }

  private currentOrLowestFanStage(): string {
    const level = this.getCapabilityValue("homeconnect_venting_level");
    return typeof level === "string" && level !== "FanOff" ? level : "FanStage01";
  }

  protected async onValuesApplied(): Promise<void> {
    await this.syncModeFromProgram();
  }

  private async syncModeFromProgram(): Promise<void> {
    if (!this.hasCapability("homeconnect_hood_mode")) return;
    const program = this.getCapabilityValue("homeconnect_program");
    const mode =
      this.isProgramRunning() && typeof program === "string" && program in PROGRAM_BY_MODE
        ? program
        : "Off";
    if (mode !== this.getCapabilityValue("homeconnect_hood_mode")) {
      await this.setCapabilityValue("homeconnect_hood_mode", mode).catch(this.error);
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

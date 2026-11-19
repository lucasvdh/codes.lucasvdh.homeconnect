"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { EventTriggerSpec } from "../../lib/appliance-device";

class DishwasherDriver extends ApplianceDriver {
  protected readonly applianceType = "Dishwasher";
  protected readonly cardPrefix = "dishwasher";

  programPhaseChangedTrigger!: Homey.FlowCardTriggerDevice;

  protected eventMap(): Record<string, EventTriggerSpec> {
    const saltLow = (severity: string): EventTriggerSpec => ({
      triggerKey: "saltLow",
      alert: "maintenance",
      tokens: () => ({ severity }),
    });
    const rinseAidLow = (severity: string): EventTriggerSpec => ({
      triggerKey: "rinseAidLow",
      alert: "maintenance",
      tokens: () => ({ severity }),
    });
    const drainingIssue = (kind: string): EventTriggerSpec => ({
      triggerKey: "drainingIssue",
      alert: "problem",
      tokens: () => ({ kind }),
    });
    return {
      "Dishcare.Dishwasher.Event.SaltLack": saltLow("empty"),
      "Dishcare.Dishwasher.Event.SaltNearlyEmpty": saltLow("nearly_empty"),
      "Dishcare.Dishwasher.Event.RinseAidLack": rinseAidLow("empty"),
      "Dishcare.Dishwasher.Event.RinseAidNearlyEmpty": rinseAidLow("nearly_empty"),
      "Dishcare.Dishwasher.Event.CheckFilterSystem": { triggerKey: "filterCheckRequired", alert: "maintenance" },
      "Dishcare.Dishwasher.Event.SmartFilterCleaningReminder": {
        triggerKey: "filterCheckRequired",
        alert: "maintenance",
      },
      "Dishcare.Dishwasher.Event.MachineCareReminder": { triggerKey: "machineCareReminder", alert: "maintenance" },
      "Dishcare.Dishwasher.Event.MachineCareAndFilterCleaningReminder": {
        triggerKey: "machineCareReminder",
        alert: "maintenance",
      },
      "Dishcare.Dishwasher.Event.DrainingNotPossible": drainingIssue("draining_not_possible"),
      "Dishcare.Dishwasher.Event.DrainPumpBlocked": drainingIssue("pump_blocked"),
      "Dishcare.Dishwasher.Event.LowVoltage": { triggerKey: "lowVoltage", alert: "problem" },
      "Dishcare.Dishwasher.Event.WaterheaterCalcified": { triggerKey: "waterHeaterCalcified", alert: "maintenance" },
      "Dishcare.Dishwasher.Event.InternalError": { triggerKey: "internalError", alert: "problem" },
      "BSH.Common.Event.AquaStopOccured": { triggerKey: "aquaStopOccurred", alert: "problem" },
      "BSH.Common.Event.LowWaterPressure": { triggerKey: "lowWaterPressure", alert: "problem" },
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
    };
  }

  async onInit(): Promise<void> {
    await super.onInit();

    this.programPhaseChangedTrigger = this.homey.flow.getDeviceTriggerCard(
      "dishwasher_program_phase_changed",
    );

    const cond = (id: string): Homey.FlowCardCondition =>
      this.homey.flow.getConditionCard(`dishwasher_${id}`);

    // Must match the values in homeconnect_program_phase.json.
    const PHASES = ["None", "PreRinse", "MainWash", "FinalRinse", "Drying"];

    const phaseCond = this.homey.flow.getConditionCard("dishwasher_program_phase_is");
    phaseCond.registerRunListener(
      async ({ device, phase }: { device: Homey.Device; phase: { id: string } }) =>
        device.getCapabilityValue("homeconnect_program_phase") === phase.id,
    );
    phaseCond.registerArgumentAutocompleteListener("phase", async (query) =>
      PHASES.filter((p) => !query || p.toLowerCase().includes(query.toLowerCase())).map((p) => ({
        name: p,
        id: p,
      })),
    );

    cond("eco_dry_is_active").registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_eco_dry_active") === true,
    );
    cond("half_load_is_on").registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_half_load") === true,
    );
    cond("silence_on_demand_is_active").registerRunListener(
      async ({ device }: { device: Homey.Device }) =>
        device.getCapabilityValue("homeconnect_silence_on_demand") === true,
    );
  }
}

module.exports = DishwasherDriver;

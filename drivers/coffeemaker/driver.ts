"use strict";

import Homey from "homey";

import { ApplianceDriver } from "../../lib/appliance-driver";
import { EventTriggerSpec } from "../../lib/appliance-device";

type CoffeeMaker = Homey.Device & {
  listBeverages(query: string): Array<{ name: string; id: string }>;
  makeBeverage(
    programName: string,
    opts?: { strength?: string; quantity?: number; temperature?: string },
  ): Promise<void>;
};

/** Cleaning and descaling reminders, surfaced through one "maintenance" trigger. */
const MAINTENANCE_EVENTS = [
  "DescalingIn20Cups",
  "DescalingIn15Cups",
  "DescalingIn10Cups",
  "DescalingIn5Cups",
  "DeviceShouldBeDescaled",
  "DeviceDescalingOverdue",
  "DeviceDescalingBlockage",
  "DeviceShouldBeCleaned",
  "DeviceCleaningOverdue",
  "CalcNCleanIn20Cups",
  "CalcNCleanIn15Cups",
  "CalcNCleanIn10Cups",
  "CalcNCleanIn5Cups",
  "DeviceShouldBeCalcNCleaned",
  "DeviceCalcNCleanOverdue",
  "DeviceCalcNCleanBlockage",
];

class CoffeeMakerDriver extends ApplianceDriver {
  protected readonly applianceType = "CoffeeMaker";
  protected readonly cardPrefix = "coffeemaker";

  protected eventMap(): Record<string, EventTriggerSpec> {
    const ev = "ConsumerProducts.CoffeeMaker.Event.";
    const map: Record<string, EventTriggerSpec> = {
      [`${ev}BeanContainerEmpty`]: { triggerKey: "beanContainerEmpty" },
      [`${ev}WaterTankEmpty`]: { triggerKey: "waterTankEmpty" },
      [`${ev}DripTrayFull`]: { triggerKey: "dripTrayFull" },
      [`${ev}KeepMilkTankCool`]: { triggerKey: "keepMilkTankCool" },
      "BSH.Common.Event.SoftwareUpdateAvailable": { triggerKey: "softwareUpdateAvailable" },
    };
    for (const name of MAINTENANCE_EVENTS) {
      map[`${ev}${name}`] = {
        triggerKey: "maintenanceRequired",
        tokens: () => ({ reminder: name }),
      };
    }
    return map;
  }

  async onInit(): Promise<void> {
    await super.onInit();

    const autocomplete = async (query: string, args: { device: CoffeeMaker }) =>
      args.device.listBeverages(query);

    const make = this.homey.flow.getActionCard("coffeemaker_make_beverage");
    make.registerRunListener(
      async ({ device, beverage }: { device: CoffeeMaker; beverage: { id: string } }) =>
        device.makeBeverage(beverage.id),
    );
    make.registerArgumentAutocompleteListener("beverage", autocomplete);

    const custom = this.homey.flow.getActionCard("coffeemaker_make_beverage_custom");
    custom.registerRunListener(
      async (args: {
        device: CoffeeMaker;
        beverage: { id: string };
        strength: string;
        quantity: number;
        temperature: string;
      }) =>
        args.device.makeBeverage(args.beverage.id, {
          strength: args.strength,
          quantity: args.quantity,
          temperature: args.temperature,
        }),
    );
    custom.registerArgumentAutocompleteListener("beverage", autocomplete);

    this.homey.flow
      .getConditionCard("coffeemaker_cup_warmer_is_on")
      .registerRunListener(
        async ({ device }: { device: CoffeeMaker }) =>
          device.getCapabilityValue("homeconnect_cup_warmer") === true,
      );
  }
}

module.exports = CoffeeMakerDriver;

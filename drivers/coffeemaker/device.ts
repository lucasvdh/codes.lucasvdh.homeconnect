"use strict";

import { ApplianceDevice } from "../../lib/appliance-device";

const OPTION = "ConsumerProducts.CoffeeMaker.Option.";

export const MACHINE_DEFAULT = "default";

export interface BeverageOptions {
  strength?: string;
  /** ml; 0 = the machine's own. The machine enforces its range. */
  quantity?: number;
  /** e.g. "92C" */
  temperature?: string;
}

const DRINK_PROGRAMS = [
  "ConsumerProducts.CoffeeMaker.Program.Beverage.",
  "ConsumerProducts.CoffeeMaker.Program.CoffeeWorld.",
];

// Drinks and ranges differ per model, so the machine is the judge: it rejects what it can't make.
class CoffeeMakerDevice extends ApplianceDevice {
  listBeverages(query = ""): Array<{ name: string; id: string }> {
    return this.listPrograms(query).filter((p) =>
      DRINK_PROGRAMS.some((prefix) => p.id.startsWith(prefix)),
    );
  }

  async makeBeverage(programName: string, opts: BeverageOptions = {}): Promise<void> {
    if (this.getCapabilityValue("onoff") === false) {
      throw new Error(this.homey.__("device.error.powered_off"));
    }
    if (!DRINK_PROGRAMS.some((prefix) => programName.startsWith(prefix))) {
      throw new Error(this.homey.__("device.error.unknown_program"));
    }
    const wanted: Record<string, unknown> = {};
    if (opts.strength && opts.strength !== MACHINE_DEFAULT) {
      wanted[`${OPTION}BeanAmount`] = opts.strength;
    }
    if (opts.quantity) wanted[`${OPTION}FillQuantity`] = Math.round(opts.quantity);
    if (opts.temperature && opts.temperature !== MACHINE_DEFAULT) {
      wanted[`${OPTION}CoffeeTemperature`] = opts.temperature;
    }
    // Options the model lacks are left to the machine instead of failing the drink.
    const options: Record<string, unknown> = {};
    for (const [feature, value] of Object.entries(wanted)) {
      if (this.findUid(feature) != null) options[feature] = value;
      else this.log(`makeBeverage: ${feature} not on this model, using the machine setting`);
    }
    await this.startProgramWithOptions(programName, options);
  }
}

module.exports = CoffeeMakerDevice;

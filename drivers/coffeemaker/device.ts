"use strict";

import { ApplianceDevice } from "../../lib/appliance-device";

const OPTION = "ConsumerProducts.CoffeeMaker.Option.";

/** Flow value meaning "use the machine's own setting for this drink". */
export const MACHINE_DEFAULT = "default";

export interface BeverageOptions {
  /** BeanAmount member, e.g. "Strong", or MACHINE_DEFAULT. */
  strength?: string;
  /** Fill quantity in ml, 0 for the machine's own; the machine enforces its range. */
  quantity?: number;
  /** CoffeeTemperature member suffix, e.g. "92C", or MACHINE_DEFAULT. */
  temperature?: string;
}

/** Only real drinks; the program list also holds cleaning and descaling runs. */
const DRINK_PROGRAMS = [
  "ConsumerProducts.CoffeeMaker.Program.Beverage.",
  "ConsumerProducts.CoffeeMaker.Program.CoffeeWorld.",
];

/**
 * Coffee machine. Every drink is a program (ConsumerProducts.CoffeeMaker.
 * Program.Beverage.* / CoffeeWorld.*); strength, quantity and temperature are
 * options of that program. Which drinks and ranges exist differs per model,
 * so the appliance is the judge: it rejects what it doesn't support.
 */
class CoffeeMakerDevice extends ApplianceDevice {
  /** Drinks this machine offers, for the Flow card autocomplete. */
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
    // Not every model has every option (e.g. no temperature choice): leave
    // those to the machine instead of failing the whole drink.
    const options: Record<string, unknown> = {};
    for (const [feature, value] of Object.entries(wanted)) {
      if (this.findUid(feature) != null) options[feature] = value;
      else this.log(`makeBeverage: ${feature} not on this model, using the machine setting`);
    }
    await this.startProgramWithOptions(programName, options);
  }
}

module.exports = CoffeeMakerDevice;

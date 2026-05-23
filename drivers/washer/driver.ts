"use strict";

import { ApplianceDriver } from "../../lib/appliance-driver";

class WasherDriver extends ApplianceDriver {
  protected readonly applianceType = "Washer";
  protected readonly cardPrefix = "washer";
}

module.exports = WasherDriver;

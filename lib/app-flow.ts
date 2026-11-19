"use strict";

import Homey from "homey";

export type AlertKind = "problem" | "maintenance";

const ANY_APPLIANCE = "any";

interface ApplianceArg {
  appliance: { id: string };
}

interface ApplianceState {
  haId: string;
}

export class AppFlowCards {
  private readonly problem: Homey.FlowCardTrigger;
  private readonly maintenance: Homey.FlowCardTrigger;
  private readonly unreachable: Homey.FlowCardTrigger;
  private readonly reachable: Homey.FlowCardTrigger;

  constructor(private readonly homey: Homey.App["homey"]) {
    this.problem = this.applianceTrigger("appliance_problem");
    this.maintenance = this.applianceTrigger("appliance_maintenance");
    this.unreachable = this.applianceTrigger("appliance_unreachable");
    this.reachable = this.applianceTrigger("appliance_reachable");
  }

  alert(kind: AlertKind, device: Homey.Device, code: string): void {
    const card = kind === "problem" ? this.problem : this.maintenance;
    const tokens = { ...this.applianceTokens(device), message: this.alertMessage(code), code };
    card.trigger(tokens, this.stateFor(device)).catch(device.error);
  }

  reachabilityChanged(device: Homey.Device, reachable: boolean, reason?: string): void {
    if (reachable) {
      this.reachable.trigger(this.applianceTokens(device), this.stateFor(device)).catch(device.error);
      return;
    }
    const tokens = {
      ...this.applianceTokens(device),
      reason: this.homey.__(`device.unavailable.${reason ?? "unknown"}`),
    };
    this.unreachable.trigger(tokens, this.stateFor(device)).catch(device.error);
  }

  private applianceTrigger(id: string): Homey.FlowCardTrigger {
    const card = this.homey.flow.getTriggerCard(id);
    card.registerRunListener(
      async (args: ApplianceArg, state: ApplianceState) =>
        args.appliance.id === ANY_APPLIANCE || args.appliance.id === state.haId,
    );
    card.registerArgumentAutocompleteListener("appliance", async (query: string) =>
      this.applianceChoices(query),
    );
    return card;
  }

  private applianceChoices(query: string): Array<{ id: string; name: string; description?: string }> {
    const q = query.trim().toLowerCase();
    const devices = Object.values(this.homey.drivers.getDrivers()).flatMap((driver) =>
      driver.getDevices().map((device) => ({
        id: String(device.getData().id),
        name: device.getName(),
        description: this.typeName(device),
      })),
    );
    const matching = devices
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: ANY_APPLIANCE, name: this.homey.__("flow.any_appliance") }, ...matching];
  }

  private applianceTokens(device: Homey.Device): { appliance: string; appliance_type: string } {
    return { appliance: device.getName(), appliance_type: this.typeName(device) };
  }

  private stateFor(device: Homey.Device): ApplianceState {
    return { haId: String(device.getData().id) };
  }

  private typeName(device: Homey.Device): string {
    const name = (device.driver.manifest as { name?: Record<string, string> }).name ?? {};
    return name[this.homey.i18n.getLanguage()] ?? name.en ?? device.driver.id;
  }

  // Events without a translation (any the eventMaps don't know) show their code.
  private alertMessage(code: string): string {
    const key = `alert.${code}`;
    const text = this.homey.__(key);
    return text && text !== key ? text : code;
  }
}

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  ZONE_TITLES,
  availableZones,
  parseZoneFeature,
  applyZoneValues,
  zoneDisplay,
  zoneIsOn,
  activeZoneCount,
  cookingEdge,
  zoneTitle,
} = require(path.resolve(__dirname, "..", ".homeybuild", "lib", "hob-zones.js"));

test("zones are the zone lists the appliance marks available", () => {
  const features = {
    8194: { name: "Cooking.Hob.StatusList.Zone.100", available: "true" },
    8204: { name: "Cooking.Hob.Status.Zone.100.PowerLevel", available: "true" },
    8212: { name: "Cooking.Hob.StatusList.Zone.120", available: "false" },
    8222: { name: "Cooking.Hob.Status.Zone.120.PowerLevel", available: "true" },
    8284: { name: "Cooking.Hob.StatusList.Zone.400", available: "true" },
    8230: { name: "Cooking.Hob.StatusList.Zone.200" },
    8236: { name: "Cooking.Hob.StatusList.Zone.300", available: false },
    8207: { name: "Cooking.Hob.StatusList.Zone.100.SwitchOffTimer", available: "true" },
  };
  assert.deepEqual(availableZones(features), ["100", "200", "400"]);
});

test("without zone lists, the zones with a power level are used", () => {
  const features = {
    8204: { name: "Cooking.Hob.Status.Zone.100.PowerLevel" },
    8302: { name: "Cooking.Hob.Status.Zone.400.PowerLevel" },
    8203: { name: "Cooking.Hob.Status.Zone.100.OperationState" },
  };
  assert.deepEqual(availableZones(features), ["100", "400"]);
});

test("only per-zone status features are recognised", () => {
  assert.deepEqual(parseZoneFeature("Cooking.Hob.Status.Zone.341.State"), { zone: "341", key: "State" });
  assert.equal(parseZoneFeature("Cooking.Hob.Status.Zone.100.ElapsedProgramTime.AutoCounting"), null);
  assert.equal(parseZoneFeature("Cooking.Hob.StatusList.Zone.100"), null);
});

test("zone values are merged into the readings and report what changed", () => {
  const readings = new Map();
  const changed = applyZoneValues(readings, {
    "Cooking.Hob.Status.Zone.100.PowerLevel": "45",
    "Cooking.Hob.Status.Zone.200.State": "ResiduelHeat",
    "Cooking.Hob.Status.Zone.200.Type": "Cooking",
    "BSH.Common.Status.OperationState": "Run",
  });
  assert.deepEqual(changed.sort(), ["100", "200"]);
  assert.deepEqual(readings.get("100"), { power: "45" });
  assert.deepEqual(readings.get("200"), { state: "ResiduelHeat" });
});

test("switching the hob off turns every zone off", () => {
  const readings = new Map([["100", { power: "45" }], ["200", { power: "Off" }]]);
  const changed = applyZoneValues(readings, { "BSH.Common.Setting.PowerState": "Off" });
  assert.deepEqual(changed, ["100"]);
  assert.equal(activeZoneCount(readings), 0);
});

test("an off zone with residual heat shows residual heat", () => {
  assert.equal(zoneDisplay({ power: "Off", state: "ResiduelHeat" }), "ResidualHeat");
  assert.equal(zoneDisplay({ power: "Off", state: "Off" }), "Off");
  assert.equal(zoneDisplay({ state: "ResiduelHeat" }), "ResidualHeat");
  assert.equal(zoneDisplay({}), "Off");
});

test("a zone with power shows its level, whatever its state", () => {
  assert.equal(zoneDisplay({ power: "45", state: "Active" }), "45");
  assert.equal(zoneDisplay({ power: "Boost1", state: "ResiduelHeat" }), "Boost1");
});

test("keep warm and boost count as on, residual heat does not", () => {
  assert.equal(zoneIsOn({ power: "KeepWarm" }), true);
  assert.equal(zoneIsOn({ power: "Boost2" }), true);
  assert.equal(zoneIsOn({ power: "Off", state: "ResiduelHeat" }), false);
  assert.equal(zoneIsOn({ state: "Active" }), false);
});

test("cooking starts with the first zone and stops with the last", () => {
  assert.equal(cookingEdge(0, 1), "started");
  assert.equal(cookingEdge(1, 2), null);
  assert.equal(cookingEdge(2, 1), null);
  assert.equal(cookingEdge(1, 0), "stopped");
  assert.equal(cookingEdge(0, 0), null);
});

test("the first count after pairing is not an edge", () => {
  assert.equal(cookingEdge(null, 1), null);
  assert.equal(cookingEdge(null, 0), null);
});

test("an unknown zone id still gets a title", () => {
  assert.equal(zoneTitle("100").nl, "Linksvoor");
  assert.equal(zoneTitle("999").en, "Zone 999");
});

test("the zone dropdowns in the Flow cards match the zone titles", () => {
  const flow = require(path.resolve(__dirname, "..", "drivers", "hob", "driver.flow.compose.json"));
  const dropdowns = [...flow.triggers, ...flow.conditions]
    .flatMap((card) => card.args ?? [])
    .filter((arg) => arg.name === "zone");
  assert.ok(dropdowns.length > 0);
  for (const arg of dropdowns) {
    const zones = Object.fromEntries(
      arg.values.filter((v) => v.id !== "any").map((v) => [v.id, v.title]),
    );
    assert.deepEqual(zones, ZONE_TITLES);
  }
});

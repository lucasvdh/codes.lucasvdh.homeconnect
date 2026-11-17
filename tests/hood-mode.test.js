"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { hoodModeFor, modeToShow, MODE_SETTLE_MS } = require(
  path.resolve(__dirname, "..", ".homeybuild", "lib", "hood-mode.js"),
);

test("the mode follows the running program", () => {
  assert.equal(hoodModeFor(false, "Automatic"), "Off");
  assert.equal(hoodModeFor(true, "Venting"), "Venting");
  assert.equal(hoodModeFor(true, "Automatic"), "Automatic");
  assert.equal(hoodModeFor(true, "DelayedShutOff"), "DelayedShutOff");
});

test("a running program without a mode shows no mode instead of Off", () => {
  assert.equal(hoodModeFor(true, "Interval"), null);
  assert.equal(hoodModeFor(true, "constructor"), null);
  assert.equal(hoodModeFor(true, null), null);
});

test("a just picked mode is kept until the hood reports it", () => {
  const picked = { mode: "Automatic", atMs: 1_000 };
  assert.equal(modeToShow("Off", picked, 2_000), undefined);
  assert.equal(modeToShow("Automatic", picked, 2_000), "Automatic");
  assert.equal(modeToShow("Off", picked, 1_000 + MODE_SETTLE_MS), "Off");
  assert.equal(modeToShow("Off", null, 2_000), "Off");
});

"use strict";

/** Merging a device's stored config with the app's, incl. the <= 1.4.2 host migration. */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { mergeStoredConfig } = require(
  path.resolve(__dirname, "..", ".homeybuild", "lib", "device-config.js"),
);

const base = (over = {}) => ({
  name: "dishwasher",
  haId: "123456789012",
  host: "BOSCH-Dishwasher-123456789012",
  key: "k1",
  description: { type: "Dishwasher", brand: "BOSCH", model: "SBV6ZCX10E", version: "1", revision: "0" },
  features: { 1: { name: "a" } },
  ...over,
});

test("first init: take the app's config", () => {
  const r = mergeStoredConfig(undefined, base());
  assert.equal(r.changed, true);
  assert.equal(r.config.host, "BOSCH-Dishwasher-123456789012");
});

test("no config anywhere stays empty", () => {
  assert.deepEqual(mergeStoredConfig(undefined, undefined), { config: undefined, changed: false });
});

test("migration: an IP pinned into host moves to address, the name comes back", () => {
  const r = mergeStoredConfig(base({ host: "192.168.1.40" }), base());
  assert.equal(r.changed, true);
  assert.equal(r.config.host, "BOSCH-Dishwasher-123456789012");
  assert.equal(r.config.address, "192.168.1.40");
});

test("an IP the user imported on purpose stays the host", () => {
  const r = mergeStoredConfig(base({ host: "192.168.1.40" }), base({ host: "192.168.1.40" }));
  assert.equal(r.changed, false);
  assert.equal(r.config.host, "192.168.1.40");
});

test("new keys from the app are taken, the learned address is kept", () => {
  const r = mergeStoredConfig(base({ address: "192.168.1.40" }), base({ key: "k2" }));
  assert.equal(r.changed, true);
  assert.equal(r.config.key, "k2");
  assert.equal(r.config.address, "192.168.1.40");
});

test("unchanged config is not rewritten", () => {
  const r = mergeStoredConfig(base({ address: "192.168.1.40" }), base());
  assert.equal(r.changed, false);
  assert.equal(r.config.address, "192.168.1.40");
});

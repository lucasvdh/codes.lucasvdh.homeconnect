"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { isFeatureWritableNow, describeFeatureState } = require(
  path.resolve(__dirname, "..", ".homeybuild", "lib", "feature-state.js"),
);

test("a feature is writable unless read-only or unavailable", () => {
  assert.equal(isFeatureWritableNow({ name: "x", access: "readWrite" }), true);
  assert.equal(isFeatureWritableNow({ name: "x", access: "READWRITE", available: "true" }), true);
  assert.equal(isFeatureWritableNow({ name: "x" }), true);
  assert.equal(isFeatureWritableNow({ name: "x", access: "read" }), false);
  assert.equal(isFeatureWritableNow({ name: "x", access: "readWrite", available: "false" }), false);
  assert.equal(isFeatureWritableNow({ name: "x", access: "readWrite", available: false }), false);
  assert.equal(isFeatureWritableNow(undefined), false);
});

test("the feature state names access and availability for the log", () => {
  assert.equal(
    describeFeatureState({ name: "x", access: "read", available: "true" }),
    "access=read available=true",
  );
  assert.equal(describeFeatureState({ name: "x" }), "access=- available=-");
  assert.equal(describeFeatureState(undefined), "unknown");
});

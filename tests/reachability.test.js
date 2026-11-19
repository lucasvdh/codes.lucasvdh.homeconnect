"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { ReachabilityReporter } = require(
  path.resolve(__dirname, "..", ".homeybuild", "lib", "reachability.js"),
);

function setup() {
  const changes = [];
  let pending = null;
  const timers = {
    setTimeout: (fn) => (pending = fn),
    clearTimeout: () => (pending = null),
  };
  const reporter = new ReachabilityReporter((reachable, reason) => changes.push([reachable, reason]), timers, 1000);
  const elapse = () => {
    const fn = pending;
    pending = null;
    fn?.();
  };
  return { reporter, changes, elapse, isPending: () => pending !== null };
}

test("a drop shorter than the delay reports nothing", () => {
  const { reporter, changes, isPending } = setup();
  reporter.unavailable("connect_timeout");
  reporter.connected();
  assert.equal(isPending(), false);
  assert.deepEqual(changes, []);
});

test("reports once with the latest reason, then reachable again on connect", () => {
  const { reporter, changes, elapse } = setup();
  reporter.unavailable("connect_timeout");
  reporter.unavailable("resolve_failed");
  elapse();
  reporter.unavailable("connect_timeout");
  elapse();
  reporter.connected();
  reporter.connected();
  assert.deepEqual(changes, [
    [false, "resolve_failed"],
    [true, undefined],
  ]);
});

test("stop cancels a pending report", () => {
  const { reporter, changes, isPending } = setup();
  reporter.unavailable("connect_timeout");
  reporter.stop();
  assert.equal(isPending(), false);
  assert.deepEqual(changes, []);
});

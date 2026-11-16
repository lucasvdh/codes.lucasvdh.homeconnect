"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { ConnectionStatusStore } = require(
  path.resolve(__dirname, "..", ".homeybuild", "lib", "connection-status.js"),
);

test("state changes, reason only while unavailable, address and mDNS kept", () => {
  let now = 1000;
  const store = new ConnectionStatusStore(() => now);
  assert.deepEqual(store.get("a"), {});

  store.setState("a", "unavailable", { reason: "tls_failed", detail: "ECONNRESET" });
  store.recordMdns("a", "10.0.0.5", "name");
  assert.equal(store.get("a").reason, "tls_failed");
  assert.equal(store.get("a").since, 1000);

  now = 2000;
  store.setState("a", "unavailable", { reason: "connect_timeout", detail: "x" });
  assert.equal(store.get("a").since, 1000, "same state keeps its since");

  now = 3000;
  store.setState("a", "connected", { address: "10.0.0.5" });
  assert.deepEqual(store.get("a"), {
    state: "connected",
    reason: undefined,
    detail: undefined,
    since: 3000,
    address: "10.0.0.5",
    mdns: { address: "10.0.0.5", via: "name", at: 1000 },
  });

  store.forget("a");
  assert.deepEqual(store.get("a"), {});
});

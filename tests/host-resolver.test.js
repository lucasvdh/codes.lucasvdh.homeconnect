"use strict";

/** Name resolution fallback, with a fake dns.lookup so no network is needed. */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const BUILD = path.resolve(__dirname, "..", ".homeybuild", "lib");
const { resolveAddresses, hostCandidates } = require(path.join(BUILD, "host-resolver.js"));
const { ConnectionError } = require(path.join(BUILD, "connection-errors.js"));

const notFound = () => Promise.reject(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));

test("bare names try .local first, then the name as given", () => {
  assert.deepEqual(hostCandidates("BOSCH-Oven-1"), ["BOSCH-Oven-1.local", "BOSCH-Oven-1"]);
  assert.deepEqual(hostCandidates("oven.lan"), ["oven.lan"]);
  assert.deepEqual(hostCandidates("192.168.1.5"), ["192.168.1.5"]);
});

test("falls back to the bare name when .local doesn't resolve, and logs both", async () => {
  const lines = [];
  const lookup = (name) =>
    name.endsWith(".local") ? notFound() : Promise.resolve([{ address: "10.0.0.7", family: 4 }]);
  const addresses = await resolveAddresses("BOSCH-Oven-1", { lookup, log: (l) => lines.push(l) });
  assert.deepEqual(addresses, ["10.0.0.7"]);
  assert.deepEqual(lines, ["resolve BOSCH-Oven-1.local: ENOTFOUND", "resolve BOSCH-Oven-1: 10.0.0.7"]);
});

test("IPv4 before IPv6, duplicates removed", async () => {
  const lookup = () =>
    Promise.resolve([
      { address: "fe80::1", family: 6 },
      { address: "10.0.0.7", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);
  assert.deepEqual(await resolveAddresses("x", { lookup }), ["10.0.0.7", "fe80::1"]);
});

test("an IP is returned as-is without a lookup", async () => {
  const lookup = () => assert.fail("no lookup for an IP");
  assert.deepEqual(await resolveAddresses(" 192.168.1.5 ", { lookup }), ["192.168.1.5"]);
});

test("all attempts failing gives resolve_failed with every attempt in the detail", async () => {
  const hang = () => new Promise(() => {});
  const lookup = (name) => (name.endsWith(".local") ? hang() : notFound());
  await assert.rejects(resolveAddresses("BOSCH-Dishwasher-1", { lookup, timeoutMs: 20 }), (err) => {
    assert.ok(err instanceof ConnectionError);
    assert.equal(err.reason, "resolve_failed");
    assert.equal(err.detail, "BOSCH-Dishwasher-1.local: timeout; BOSCH-Dishwasher-1: ENOTFOUND");
    return true;
  });
});

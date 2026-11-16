"use strict";

/**
 * Matching `_homeconnect._tcp` mDNS results to a stored appliance. Instance
 * names follow hcpy's host format "BRAND-Type-<haId>" (TLS) or the bare haId
 * (AES); the other shapes are what we must also accept if a model announces
 * itself differently.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { matchMdnsResult, normalizeMdnsName, describeMdnsResult } = require(
  path.resolve(__dirname, "..", ".homeybuild", "lib", "mdns-match.js"),
);

const HAID = "384100532686002417";

test("hcpy-style TLS instance name: BRAND-Type-haId", () => {
  const r = { id: `BOSCH-Oven-${HAID}`, name: `BOSCH-Oven-${HAID}`, address: "192.168.1.20" };
  assert.deepEqual(matchMdnsResult(r, HAID), { matched: true, via: "id" });
});

test("AES appliance announcing the bare haId, with .local and case differences", () => {
  assert.equal(matchMdnsResult({ host: `${HAID}.local.` }, HAID).matched, true);
  assert.equal(matchMdnsResult({ name: "BOSCH-DISHWASHER-ABC123DEF" }, "abc123def").matched, true);
});

test("model number instead of the type in the prefix still matches", () => {
  const r = { id: `BOSCH-SBV6ZCX10E-${HAID}` };
  assert.equal(matchMdnsResult(r, HAID).matched, true);
});

test("full service name and TXT records are checked too", () => {
  const full = { fullname: `SIEMENS-Washer-${HAID}._homeconnect._tcp.local` };
  assert.deepEqual(matchMdnsResult(full, HAID), { matched: true, via: "fullname" });
  const txt = { id: "homeconnect-1", txt: { brand: "BOSCH", haid: `BOSCH-Dishwasher-${HAID}` } };
  assert.deepEqual(matchMdnsResult(txt, HAID), { matched: true, via: "txt.haid" });
});

test("a haId containing dashes must appear as a whole run", () => {
  const haId = "BOSCH-HBG634BS1-68A40E000001";
  assert.equal(matchMdnsResult({ name: "BOSCH-HBG634BS1-68A40E000001" }, haId).matched, true);
  assert.equal(matchMdnsResult({ name: "BOSCH-HBG634BS1-68A40E0000019" }, haId).matched, false);
});

test("no false positives: other appliances, partial ids, missing haId", () => {
  assert.equal(matchMdnsResult({ id: `BOSCH-Oven-${HAID}9` }, HAID).matched, false);
  assert.equal(matchMdnsResult({ id: `BOSCH-Oven-1${HAID}` }, HAID).matched, false);
  assert.equal(matchMdnsResult({ id: "SIEMENS-Washer-999999999999999999" }, HAID).matched, false);
  assert.equal(matchMdnsResult({ id: `BOSCH-Oven-${HAID}` }, undefined).matched, false);
  assert.equal(matchMdnsResult({}, HAID).matched, false);
});

test("normalize and describe", () => {
  assert.equal(normalizeMdnsName("BOSCH-Oven-1.local."), "bosch-oven-1");
  assert.equal(
    describeMdnsResult({ id: "a", txt: { brand: "BOSCH" }, address: "10.0.0.2" }),
    "id=a txt.brand=BOSCH address=10.0.0.2",
  );
});

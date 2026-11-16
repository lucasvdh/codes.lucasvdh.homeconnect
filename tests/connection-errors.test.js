"use strict";

/** Error-to-reason mapping behind the device's "unavailable" messages. */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  ConnectionError,
  classifyError,
  classifyClose,
  mostSpecific,
} = require(path.resolve(__dirname, "..", ".homeybuild", "lib", "connection-errors.js"));

const errno = (code, message = code) => Object.assign(new Error(message), { code });

test("socket error codes map to a reason", () => {
  assert.equal(classifyError(errno("ENOTFOUND")).reason, "resolve_failed");
  assert.equal(classifyError(errno("EAI_AGAIN")).reason, "resolve_failed");
  assert.equal(classifyError(errno("ECONNREFUSED")).reason, "connection_refused");
  assert.equal(classifyError(errno("ETIMEDOUT")).reason, "connect_timeout");
  assert.equal(classifyError(new Error("timed out after 8000ms")).reason, "connect_timeout");
  assert.equal(classifyError(errno("EHOSTUNREACH")).reason, "host_unreachable");
  assert.equal(classifyError(errno("ENETUNREACH")).reason, "host_unreachable");
  assert.equal(classifyError(new Error("something odd")).reason, "unknown");
});

test("TLS failures: OpenSSL codes, alerts, and anything after TCP connected", () => {
  assert.equal(classifyError(errno("ERR_SSL_TLSV1_ALERT_DECRYPT_ERROR")).reason, "tls_failed");
  assert.equal(classifyError(new Error("tlsv1 alert unknown psk identity")).reason, "tls_failed");
  // A reset or timeout once TCP was up means the handshake was refused.
  assert.equal(classifyError(errno("ECONNRESET"), { tcpConnected: true }).reason, "tls_failed");
  assert.equal(classifyError(new Error("timed out after 8000ms"), { tcpConnected: true }).reason, "tls_failed");
  // Without a TCP connection, a reset is a refused connection.
  assert.equal(classifyError(errno("ECONNRESET")).reason, "connection_refused");
});

test("websocket upgrade errors carry the HTTP status", () => {
  const r = classifyError(new Error("Unexpected server response: 403"));
  assert.deepEqual(r, { reason: "ws_rejected", detail: "HTTP 403" });
});

test("a ConnectionError keeps its own reason and detail", () => {
  const err = new ConnectionError("resolve_failed", "x", "a.local: ENOTFOUND");
  assert.deepEqual(classifyError(err), { reason: "resolve_failed", detail: "a.local: ENOTFOUND" });
});

test("close before the handshake is explained by the preceding error", () => {
  const r = classifyClose(1006, "", {
    handshakeDone: false,
    lastError: new Error("Unexpected server response: 403"),
  });
  assert.equal(r.reason, "ws_rejected");
  assert.equal(r.detail, "HTTP 403");
});

test("close codes: 1008 is a refused session, others a close by the appliance", () => {
  assert.equal(classifyClose(1008, "Header Error", { handshakeDone: false }).reason, "ws_rejected");
  const after = classifyClose(1000, "bye", { handshakeDone: true, lastError: new Error("x") });
  assert.deepEqual(after, { reason: "closed_by_appliance", detail: "close 1000 bye" });
});

test("of several per-address failures the most specific reason wins", () => {
  assert.equal(mostSpecific(["connect_timeout", "tls_failed", "connection_refused"]), "tls_failed");
  assert.equal(mostSpecific(["host_unreachable", "connect_timeout"]), "connect_timeout");
  assert.equal(mostSpecific([]), "unknown");
});

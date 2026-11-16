"use strict";

/**
 * The raw socket step against local test servers: a refused port and a
 * server that drops the TLS handshake must give different reasons.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("net");
const path = require("path");

const BUILD = path.resolve(__dirname, "..", ".homeybuild", "lib");
const { connectSocket, openConnection } = require(path.join(BUILD, "home-connect-socket.js"));
const { classifyError } = require(path.join(BUILD, "connection-errors.js"));

const PSK = Buffer.alloc(32, 1);

function listen(onConnection) {
  return new Promise((resolve) => {
    const server = net.createServer(onConnection);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return classifyError(err, { tcpConnected: err.tcpConnected });
  }
  assert.fail("expected the connection to fail");
}

test("closed port -> connection_refused", async () => {
  const server = await listen(() => {});
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  const r = await failure(connectSocket("127.0.0.1", "BOSCH-Oven-1", PSK, true, 2000, port));
  assert.equal(r.reason, "connection_refused");
});

test("TCP accepted but TLS handshake dropped -> tls_failed", async () => {
  const server = await listen((sock) => sock.destroy());
  const { port } = server.address();
  try {
    const r = await failure(connectSocket("127.0.0.1", "BOSCH-Oven-1", PSK, true, 2000, port));
    assert.equal(r.reason, "tls_failed");
  } finally {
    server.close();
  }
});

test("TCP accepted but no TLS answer -> tls_failed on timeout", async () => {
  const sockets = [];
  const server = await listen((sock) => sockets.push(sock));
  const { port } = server.address();
  try {
    const r = await failure(connectSocket("127.0.0.1", "BOSCH-Oven-1", PSK, true, 100, port));
    assert.equal(r.reason, "tls_failed");
  } finally {
    sockets.forEach((s) => s.destroy());
    server.close();
  }
});

test("openConnection: name doesn't resolve and no known address -> resolve_failed", async () => {
  const lines = [];
  const notFound = () => Promise.reject(Object.assign(new Error("nf"), { code: "ENOTFOUND" }));
  await assert.rejects(
    openConnection(
      { name: "dishwasher", host: "BOSCH-Dishwasher-1", key: "AQ", description: {}, features: {} },
      { resolve: { lookup: notFound }, log: (l) => lines.push(l) },
    ),
    (err) => err.reason === "resolve_failed",
  );
  assert.deepEqual(lines, [
    "resolve BOSCH-Dishwasher-1.local: ENOTFOUND",
    "resolve BOSCH-Dishwasher-1: ENOTFOUND",
  ]);
});

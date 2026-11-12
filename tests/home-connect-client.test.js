"use strict";

/**
 * Unit tests for HomeConnectClient, run against the compiled output in
 * .homeybuild (`npm test` compiles first). The real socket module is swapped
 * for a fake so no appliance or network is needed.
 */

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { EventEmitter } = require("events");

const BUILD = path.resolve(__dirname, "..", ".homeybuild", "lib");

/** Minimal stand-in for a `ws` WebSocket. */
class FakeWs extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.sent = [];
    this.terminated = false;
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  // Graceful close: like the real thing, frames already in flight can still
  // arrive afterwards. No "close" event until the peer answers.
  close() {
    this.readyState = 2; // CLOSING
  }
  terminate() {
    this.terminated = true;
    this.readyState = 3; // CLOSED
    this.emit("close", 1006, Buffer.from(""));
  }
}

let sockets = [];
let openDelay = null;

require.cache[require.resolve(path.join(BUILD, "home-connect-socket.js"))] = {
  exports: {
    openConnection: async () => {
      if (openDelay) await openDelay;
      const ws = new FakeWs();
      sockets.push(ws);
      return { ws, codec: null };
    },
  },
};

const { HomeConnectClient } = require(path.join(BUILD, "home-connect-client.js"));

const frame = (msg) => Buffer.from(JSON.stringify(msg));
const initialValues = (data = [{ edMsgID: 100 }]) =>
  frame({ sID: 7, msgID: 1, resource: "/ei/initialValues", version: 2, action: "POST", data });
const servicesResponse = (msgID = 100) =>
  frame({
    sID: 7,
    msgID,
    resource: "/ci/services",
    version: 1,
    action: "RESPONSE",
    data: [
      { service: "ci", version: 3 },
      { service: "ro", version: 1 },
    ],
  });

function newClient() {
  const client = new HomeConnectClient({ features: {} });
  const events = { errors: [], closes: 0, connected: 0 };
  client.on("error", (err) => events.errors.push(err));
  client.on("close", () => events.closes++);
  client.on("connected", () => events.connected++);
  return { client, events };
}

beforeEach(() => {
  sockets = [];
  openDelay = null;
});

test("handshake: answers initialValues, then requests services and state", async () => {
  const { client, events } = newClient();
  await client.connect();
  const [ws] = sockets;

  ws.emit("message", initialValues());
  assert.equal(ws.sent[0].action, "RESPONSE");
  assert.equal(ws.sent[0].resource, "/ei/initialValues");
  assert.deepEqual(
    { resource: ws.sent[1].resource, sID: ws.sent[1].sID, msgID: ws.sent[1].msgID },
    { resource: "/ci/services", sID: 7, msgID: 100 },
  );

  ws.emit("message", servicesResponse());
  const resources = ws.sent.map((m) => m.resource);
  assert.ok(resources.includes("/ci/authentication"));
  assert.ok(resources.includes("/ro/allMandatoryValues"));
  assert.equal(ws.sent.find((m) => m.resource === "/ci/info").version, 3);
  assert.equal(events.connected, 1);
  assert.equal(client.connected, true);
});

test("regression 1.4.0: a frame arriving after close() does not throw", async () => {
  // A device reconnect (e.g. new mDNS address) closes the client mid-handshake;
  // the /ci/services RESPONSE was already in flight on the closing socket.
  const { client, events } = newClient();
  await client.connect();
  const [ws] = sockets;
  ws.emit("message", initialValues());
  const sentBefore = ws.sent.length;

  client.close();
  assert.doesNotThrow(() => ws.emit("message", servicesResponse()));
  assert.equal(ws.sent.length, sentBefore, "a closed client must not answer");
  assert.equal(events.errors.length, 0);
  assert.equal(events.connected, 0);
});

test("close() while the socket is still opening terminates that socket", async () => {
  let release;
  openDelay = new Promise((resolve) => (release = resolve));
  const { client } = newClient();
  const connecting = client.connect();
  client.close();
  release();
  await connecting;

  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].terminated, true);
  assert.equal(client.connected, false);
});

test("an exception while handling a frame becomes an error event and a close", async () => {
  const { client, events } = newClient();
  await client.connect();
  const [ws] = sockets;

  // initialValues without data makes the handshake code throw.
  assert.doesNotThrow(() => ws.emit("message", initialValues(null)));
  assert.equal(events.errors.length, 1);
  assert.equal(ws.terminated, true);
  assert.equal(events.closes, 1, "close lets the device schedule a reconnect");
  assert.equal(client.connected, false);
});

test("no error listener: a failing frame still does not throw", async () => {
  const client = new HomeConnectClient({ features: {} });
  await client.connect();
  const [ws] = sockets;
  assert.doesNotThrow(() => ws.emit("message", initialValues(null)));
  assert.equal(ws.terminated, true);
});

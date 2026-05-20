"use strict";

import { EventEmitter } from "events";
import crypto from "crypto";
import WebSocket from "ws";

import { DeviceConfig, HomeConnectMessage, HomeConnectValue } from "./types";
import { AesHmacCodec } from "./aes-hmac-codec";
import { openConnection } from "./home-connect-socket";

/**
 * High-level client for one appliance. Handles the websocket lifecycle, the
 * Home Connect handshake, replies to server-driven requests, and decodes
 * value updates into a name-keyed object using the device's feature map.
 *
 * Handshake order (validated against a real BOSCH oven; see
 * tests/homeconnect-test.js): the CLIENT MUST NOT speak first. The appliance
 * opens the session by POSTing /ei/initialValues; we adopt its sID and
 * edMsgID, answer with our identity, then ask for /ci/services and - once we
 * know the service versions - request the full state. Speaking first, or
 * replying with an empty data array, gets the connection closed with
 * "Header Error" (close code 1008).
 *
 * Events:
 *   "connected"            -> handshake done, state requested
 *   "values" (Record<...>) -> one or more values changed (keyed by name)
 *   "description"          -> one or more feature descriptors changed
 *                             (access/available/min/max), e.g. when remote
 *                             control becomes (un)available
 *   "raw" (msg)            -> every decoded protocol message (debug)
 *   "close" (code, reason)
 *   "error" (err)
 */
export class HomeConnectClient extends EventEmitter {
  private readonly dev: DeviceConfig;
  private ws: WebSocket | null = null;
  private codec: AesHmacCodec | null = null;

  /** Session id + tx message id are assigned by the appliance, not us. */
  private sessionId: number | null = null;
  private txMsgId: number | null = null;
  private readonly services: Record<string, { version: number }> = {};
  private servicesKnown = false;
  private readonly pendingRequests = new Map<
    number,
    {
      resource: string;
      data?: unknown[];
      resolve: () => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(dev: DeviceConfig) {
    super();
    this.dev = dev;
  }

  async connect(): Promise<void> {
    const { ws, codec } = await openConnection(this.dev);
    this.ws = ws;
    this.codec = codec;

    // Per the handshake rule above: do nothing on open, wait for the
    // appliance to POST /ei/initialValues.
    ws.on("message", (raw: Buffer) => this.onMessage(raw));
    ws.on("close", (code: number, reason: Buffer) => {
      this.ws = null;
      this.rejectPending(new Error(`connection closed (${code} ${reason?.toString()})`));
      this.emit("close", code, reason?.toString());
    });
    ws.on("error", (err: Error) => {
      this.rejectPending(err);
      this.emit("error", err);
    });
  }

  close(): void {
    this.rejectPending(new Error("connection closed"));
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.servicesKnown;
  }

  /** Pull the current mandatory state without changing device capabilities. */
  refreshValues(): void {
    if (!this.connected) return;
    this.get("/ro/allMandatoryValues");
  }

  /** Write a value to the appliance, e.g. set PowerState or fire a command. */
  async setValue(uid: number, value: unknown): Promise<void> {
    if (this.sessionId == null) throw new Error("not connected (handshake not finished)");
    // Do not track /ro/values as a request/response command. Some BSH
    // appliances return code 400 for value writes that still physically apply
    // and then publish the real state through /ro/values notifications. If we
    // reject here, Homey rolls the capability back even though the appliance
    // changed state. Program start/select still use strict request tracking.
    this.get("/ro/values", { version: 1, action: "POST", data: [{ uid, value }] });
  }

  /**
   * Start a program immediately. `program` is the program feature's UID;
   * `options` is a list of {uid, value} option pairs (e.g. temperature,
   * duration). Pass BSH.Common.Option.StartInRelative (in seconds) via
   * `options` to schedule a delayed start. The appliance answers with a
   * RESPONSE that carries a `code` on failure - see onMessage, which turns
   * that into an "error" event.
   */
  async startProgram(
    program: number,
    options: Array<{ uid: number; value: unknown }> = [],
  ): Promise<void> {
    if (this.sessionId == null) throw new Error("not connected (handshake not finished)");
    await this.request("/ro/activeProgram", { action: "POST", data: [{ program, options }] });
  }

  /** Select (but don't start) a program - same payload as startProgram. */
  async selectProgram(
    program: number,
    options: Array<{ uid: number; value: unknown }> = [],
  ): Promise<void> {
    if (this.sessionId == null) throw new Error("not connected (handshake not finished)");
    await this.request("/ro/selectedProgram", {
      action: "POST",
      data: [{ program, options }],
    });
  }

  // --- internals -----------------------------------------------------------

  private send(msg: HomeConnectMessage): void {
    if (!this.ws) throw new Error("not connected");
    const txt = JSON.stringify(msg);
    if (this.codec) {
      this.ws.send(this.codec.encrypt(txt), { binary: true });
    } else {
      this.ws.send(txt);
    }
  }

  /** Send a request on the current session, with the auto-incrementing msgID. */
  private get(
    resource: string,
    opts: {
      version?: number;
      action?: HomeConnectMessage["action"];
      data?: unknown[];
    } = {},
  ): number {
    let version = opts.version ?? 1;
    // Once /ci/services is known, use the version the appliance advertised.
    if (this.servicesKnown) {
      const service = resource.split("/")[1];
      if (this.services[service]) version = this.services[service].version;
    }
    const msg: HomeConnectMessage = {
      sID: this.sessionId as number,
      msgID: this.txMsgId as number,
      resource,
      version,
      action: opts.action ?? "GET",
    };
    if (opts.data) msg.data = opts.data;
    const sentMsgId = msg.msgID;
    this.send(msg);
    this.txMsgId = (this.txMsgId as number) + 1;
    return sentMsgId;
  }

  private request(
    resource: string,
    opts: {
      version?: number;
      action?: HomeConnectMessage["action"];
      data?: unknown[];
    },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let msgId = 0;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(msgId);
        reject(new Error(`${resource} timed out`));
      }, 10_000);

      try {
        msgId = this.get(resource, opts);
      } catch (err) {
        clearTimeout(timer);
        reject(err as Error);
        return;
      }

      this.pendingRequests.set(msgId, {
        resource,
        data: opts.data,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
    });
  }

  /** RESPONSE to a server-initiated POST/GET, echoing their msgID. */
  private reply(msg: HomeConnectMessage, data: unknown): void {
    this.send({
      sID: msg.sID,
      msgID: msg.msgID,
      resource: msg.resource,
      version: msg.version,
      action: "RESPONSE",
      data: [data],
    });
  }

  private onMessage(raw: Buffer): void {
    let text: string;
    try {
      text = this.codec ? this.codec.decrypt(raw) : raw.toString("utf8");
    } catch (err) {
      this.emit("error", err);
      return;
    }

    let msg: HomeConnectMessage;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    this.emit("raw", msg);

    let handledPendingResponse = false;
    if (msg.action === "RESPONSE") {
      const pending = this.pendingRequests.get(msg.msgID);
      if (pending) {
        this.pendingRequests.delete(msg.msgID);
        handledPendingResponse = true;
        if (msg.code != null) {
          pending.reject(
            new Error(
              `${pending.resource} rejected by appliance (code ${msg.code}, data=${JSON.stringify(pending.data ?? [])})`,
            ),
          );
        } else {
          pending.resolve();
        }
      }
    }

    // 1) The appliance opens the session with POST /ei/initialValues.
    if (msg.action === "POST" && msg.resource === "/ei/initialValues") {
      this.sessionId = msg.sID;
      this.txMsgId = (msg.data?.[0] as { edMsgID: number }).edMsgID;
      this.reply(msg, {
        deviceType: msg.version === 1 ? 2 : "Application",
        deviceName: "homey-homeconnect",
        deviceID: "0badcafe",
      });
      this.get("/ci/services");
      return;
    }

    // 2) Reply to /ci/services: now we know versions; pull the full state.
    if (
      (msg.action === "RESPONSE" || msg.action === "NOTIFY") &&
      msg.resource === "/ci/services"
    ) {
      for (const svc of (msg.data as Array<{ service: string; version: number }>) ?? []) {
        this.services[svc.service] = { version: svc.version };
      }
      this.servicesKnown = true;

      if (this.services.iz) {
        this.get("/iz/info");
      } else {
        const nonce = crypto.randomBytes(32).toString("base64url");
        this.get("/ci/authentication", { version: 2, data: [{ nonce }] });
        this.get("/ci/info");
      }
      this.get("/ei/deviceReady", { version: 2, action: "NOTIFY" });
      if (this.services.ni) this.get("/ni/info");
      this.get("/ro/allMandatoryValues");
      this.get("/ro/allDescriptionChanges");
      this.emit("connected");
      return;
    }

    // 3) Value updates: RESPONSE to our GETs, or unsolicited NOTIFY.
    if (
      (msg.resource === "/ro/values" || msg.resource === "/ro/allMandatoryValues") &&
      Array.isArray(msg.data)
    ) {
      this.emitValues(msg.data as HomeConnectValue[]);
    }

    // 3a) Description changes: appliance tells us a feature's access /
    //     available / min / max changed (e.g. remote control toggled). Patch
    //     the live feature descriptor so dependent code (writable capability
    //     listeners, dynamic capability sync) sees the new constraints.
    if (
      (msg.resource === "/ro/descriptionChange" ||
        msg.resource === "/ro/allDescriptionChanges") &&
      Array.isArray(msg.data)
    ) {
      const changes = msg.data as Array<Record<string, unknown>>;
      this.applyDescriptionChanges(changes);
      this.emitDescriptionValues(changes);
    }

    // 3b) RESPONSE to a startProgram/selectProgram POST: a non-null `code`
    //     means the appliance refused it (e.g. remote start not enabled).
    if (
      (msg.resource === "/ro/activeProgram" || msg.resource === "/ro/selectedProgram") &&
      msg.action === "RESPONSE" &&
      msg.code != null &&
      !handledPendingResponse
    ) {
      this.emit("error", new Error(`Appliance rejected the program (code ${msg.code})`));
    }

    // 4) Any other server-initiated POST must be acknowledged or the
    //    appliance stalls the stream.
    if (msg.action === "POST" && msg.resource !== "/ei/initialValues") {
      this.reply(msg, {});
    }
  }

  /**
   * Patch the live feature map with delta attributes from the appliance.
   * Mirrors hcpy HCDevice.handle_message for /ro/descriptionChange (see
   * hcpy/HCDevice.py:454-487). Emits a "description" event with the names of
   * features whose mutable attributes changed.
   */
  private applyDescriptionChanges(changes: Array<Record<string, unknown>>): void {
    const features = this.dev.features ?? {};
    const changedNames: string[] = [];
    for (const change of changes) {
      const uid = String(change.uid as string | number);
      if (!uid) continue;
      const feature = features[uid] ?? ({} as Record<string, unknown>);
      let touched = false;
      for (const key of ["access", "available", "min", "max", "default"] as const) {
        if (key in change) {
          (feature as Record<string, unknown>)[key] = change[key];
          touched = true;
        }
      }
      // First time we see this UID - adopt the descriptor wholesale so
      // subsequent value updates can resolve a name for it.
      if (!features[uid]) {
        features[uid] = change as unknown as (typeof features)[string];
        touched = true;
      }
      if (touched && features[uid]?.name) changedNames.push(features[uid].name as string);
    }
    if (changedNames.length > 0) this.emit("description", changedNames);
  }

  /**
   * Home Connect can include a `value` in description-change payloads. hcpy
   * parses those as state updates too; without this, appliance-side actions
   * can change descriptor state without Homey seeing the corresponding
   * capability value.
   */
  private emitDescriptionValues(changes: Array<Record<string, unknown>>): void {
    const values: HomeConnectValue[] = [];
    for (const change of changes) {
      if (!Object.prototype.hasOwnProperty.call(change, "value")) continue;
      const uid = Number(change.uid);
      if (!Number.isFinite(uid)) continue;
      values.push({ uid, value: change.value });
    }
    if (values.length > 0) this.emitValues(values);
  }

  /** Resolve UIDs to feature names + enum members and emit a keyed object. */
  private emitValues(values: HomeConnectValue[]): void {
    const features = this.dev.features ?? {};
    const out: Record<string, unknown> = {};
    for (const { uid, value } of values) {
      const feature = features[String(uid)];
      const key = feature?.name ?? `uid:${uid}`;

      // ActiveProgram / SelectedProgram / BaseProgram don't carry an enum
      // value - their value IS a UID pointing at the program's own feature.
      // Resolve it to that program's name (last dotted segment), matching
      // hcpy's parse_values. Without this the raw numeric UID reaches the
      // string capability `homeconnect_program` and Homey rejects it.
      if (
        key === "BSH.Common.Root.ActiveProgram" ||
        key === "BSH.Common.Root.SelectedProgram" ||
        key === "BSH.Common.Option.BaseProgram"
      ) {
        const programName = features[String(value)]?.name;
        out[key] = programName ? programName.split(".").pop() : null;
        continue;
      }

      if (feature?.values && (typeof value === "number" || typeof value === "string")) {
        out[key] = feature.values[String(value)] ?? value;
      } else {
        out[key] = value;
      }
    }
    if (Object.keys(out).length > 0) this.emit("values", out);
  }

  private rejectPending(err: Error): void {
    for (const [msgId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pendingRequests.delete(msgId);
    }
  }
}

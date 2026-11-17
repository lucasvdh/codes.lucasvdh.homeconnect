"use strict";

import { EventEmitter } from "events";
import crypto from "crypto";
import WebSocket from "ws";

import { DeviceConfig, HomeConnectMessage, HomeConnectValue } from "./types";
import { AesHmacCodec } from "./aes-hmac-codec";
import { OpenOptions, openConnection } from "./home-connect-socket";

// The client must not speak first: the appliance opens with POST /ei/initialValues. Speaking
// first, or answering with an empty data array, closes the socket with "Header Error" (1008).
export class HomeConnectClient extends EventEmitter {
  private readonly dev: DeviceConfig;
  private ws: WebSocket | null = null;
  private codec: AesHmacCodec | null = null;

  // Assigned by the appliance, not by us.
  private sessionId: number | null = null;
  private txMsgId: number | null = null;
  private readonly services: Record<string, { version: number }> = {};
  private servicesKnown = false;
  private closed = false;
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

  // Raw, because the capability only holds the last name segment.
  selectedProgramUid: number | null = null;

  address: string | null = null;
  // An HTTP 403 on the upgrade arrives as an error first, then as a close.
  lastError: Error | null = null;

  private readonly openOptions: OpenOptions;

  constructor(dev: DeviceConfig, openOptions: OpenOptions = {}) {
    super();
    this.dev = dev;
    this.openOptions = openOptions;
  }

  get handshakeDone(): boolean {
    return this.servicesKnown;
  }

  async connect(): Promise<void> {
    const { ws, codec, address } = await openConnection(this.dev, this.openOptions);
    // close() can come while the socket was still opening (e.g. a new mDNS address).
    if (this.closed) {
      ws.terminate();
      return;
    }
    this.ws = ws;
    this.codec = codec;
    this.address = address;

    ws.on("message", (raw: Buffer) => {
      // A replaced socket still delivers in-flight frames (often /ci/services after a reconnect).
      if (this.ws !== ws) return;
      // A throw here would crash the app. Drop the socket: the "close" triggers a reconnect.
      try {
        this.onMessage(raw);
      } catch (err) {
        this.emitError(err as Error);
        if (this.ws === ws) ws.terminate();
      }
    });
    ws.on("close", (code: number, reason: Buffer) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.rejectPending(new Error(`connection closed (${code} ${reason?.toString()})`));
      this.emit("close", code, reason?.toString());
    });
    ws.on("error", (err: Error) => {
      if (this.ws !== ws) return;
      this.lastError = err;
      this.rejectPending(err);
      this.emitError(err);
    });
  }

  close(): void {
    this.closed = true;
    this.rejectPending(new Error("connection closed"));
    this.ws?.close();
    this.ws = null;
  }

  // EventEmitter throws on "error" when nobody listens.
  private emitError(err: Error): void {
    if (this.listenerCount("error") > 0) this.emit("error", err);
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.servicesKnown;
  }

  refreshValues(): void {
    if (!this.connected) return;
    this.get("/ro/allMandatoryValues");
  }

  async setValue(uid: number, value: unknown): Promise<void> {
    if (this.sessionId == null) throw new Error("not connected (handshake not finished)");
    // Fire-and-forget: some appliances answer 400 to writes that do apply, and rejecting
    // would make Homey roll the capability back. The real state follows as a NOTIFY.
    this.get("/ro/values", { version: 1, action: "POST", data: [{ uid, value }] });
  }

  // A delayed start is the StartInRelative option, in seconds.
  async startProgram(
    program: number,
    options: Array<{ uid: number; value: unknown }> = [],
  ): Promise<void> {
    if (this.sessionId == null) throw new Error("not connected (handshake not finished)");
    await this.request("/ro/activeProgram", { action: "POST", data: [{ program, options }] });
  }

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

  private send(msg: HomeConnectMessage): void {
    if (!this.ws) throw new Error("not connected");
    const txt = JSON.stringify(msg);
    if (this.codec) {
      this.ws.send(this.codec.encrypt(txt), { binary: true });
    } else {
      this.ws.send(txt);
    }
  }

  private get(
    resource: string,
    opts: {
      version?: number;
      action?: HomeConnectMessage["action"];
      data?: unknown[];
    } = {},
  ): number {
    let version = opts.version ?? 1;
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
      this.emitError(err as Error);
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

    // 3a) Access / availability / min / max changed, e.g. remote control toggled.
    if (
      (msg.resource === "/ro/descriptionChange" ||
        msg.resource === "/ro/allDescriptionChanges") &&
      Array.isArray(msg.data)
    ) {
      const changes = msg.data as Array<Record<string, unknown>>;
      this.applyDescriptionChanges(changes);
      this.emitDescriptionValues(changes);
    }

    // 3b) A non-null `code` means a program start/select was refused.
    if (
      (msg.resource === "/ro/activeProgram" || msg.resource === "/ro/selectedProgram") &&
      msg.action === "RESPONSE" &&
      msg.code != null &&
      !handledPendingResponse
    ) {
      this.emitError(new Error(`Appliance rejected the program (code ${msg.code})`));
    }

    // 4) Any other server-initiated POST must be acknowledged or the
    //    appliance stalls the stream.
    if (msg.action === "POST" && msg.resource !== "/ei/initialValues") {
      this.reply(msg, {});
    }
  }

  // Mirrors hcpy HCDevice.handle_message for /ro/descriptionChange (HCDevice.py:454-487).
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
      if (!features[uid]) {
        features[uid] = change as unknown as (typeof features)[string];
        touched = true;
      }
      if (touched && features[uid]?.name) changedNames.push(features[uid].name as string);
    }
    if (changedNames.length > 0) this.emit("description", changedNames);
  }

  // Description changes can carry a `value`; hcpy treats it as a state update too.
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

  private emitValues(values: HomeConnectValue[]): void {
    const features = this.dev.features ?? {};
    const out: Record<string, unknown> = {};
    for (const { uid, value } of values) {
      const feature = features[String(uid)];
      const key = feature?.name ?? `uid:${uid}`;

      // The value of these roots is the UID of the program's own feature (as in hcpy parse_values).
      if (
        key === "BSH.Common.Root.ActiveProgram" ||
        key === "BSH.Common.Root.SelectedProgram" ||
        key === "BSH.Common.Option.BaseProgram"
      ) {
        const programName = features[String(value)]?.name;
        if (key === "BSH.Common.Root.SelectedProgram") {
          this.selectedProgramUid = programName ? Number(value) : null;
        }
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

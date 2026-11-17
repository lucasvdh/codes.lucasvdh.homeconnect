"use strict";

import tls from "tls";
import net from "net";
import http from "http";
import https from "https";
import WebSocket from "ws";

import { DeviceConfig } from "./types";
import { AesHmacCodec, b64urlDecode } from "./aes-hmac-codec";
import { resolveAddresses, urlHost, ResolveOptions } from "./host-resolver";
import { ConnectionError, ConnectionReason, classifyError, mostSpecific } from "./connection-errors";

const CONNECT_TIMEOUT_MS = 8_000;

export interface OpenedConnection {
  ws: WebSocket;
  codec: AesHmacCodec | null;
  address: string;
}

export interface OpenOptions {
  /** Tried in order before the hostname is resolved. */
  preferredAddresses?: string[];
  log?: (line: string) => void;
  connectTimeoutMs?: number;
  resolve?: Omit<ResolveOptions, "log">;
}

// Hands `ws` our own pre-opened (TLS-PSK) socket, so it only does the upgrade and framing.
function makeStaticAgent(socket: net.Socket, useTls: boolean): http.Agent {
  const Base = useTls ? https.Agent : http.Agent;
  return new (class extends Base {
    createConnection(): net.Socket {
      return socket;
    }
  })({ keepAlive: false });
}

// Throws the most specific ConnectionError seen, so the device can say why it is unavailable.
export async function openConnection(
  dev: DeviceConfig,
  opts: OpenOptions = {},
): Promise<OpenedConnection> {
  const log = opts.log ?? (() => {});
  const psk = b64urlDecode(dev.key);
  const useTls = !dev.iv;
  const host = dev.host.trim();
  const port = useTls ? 443 : 80;

  const failures: string[] = [];
  const reasons: ConnectionReason[] = [];
  const tried = new Set<string>();

  const tryAll = async (addresses: string[], source: string): Promise<net.Socket | null> => {
    for (const address of addresses) {
      if (!address || tried.has(address)) continue;
      tried.add(address);
      try {
        const socket = await connectSocket(address, host, psk, useTls, opts.connectTimeoutMs);
        log(`connect ${address}:${port} (${source}): ok`);
        return socket;
      } catch (err) {
        const { reason, detail } = classifyError(err, {
          tcpConnected: (err as { tcpConnected?: boolean }).tcpConnected,
        });
        log(`connect ${address}:${port} (${source}): ${reason} ${detail}`);
        failures.push(`${address}: ${detail}`);
        reasons.push(reason);
      }
    }
    return null;
  };

  let socket = await tryAll(opts.preferredAddresses ?? [], "known address");
  let resolveError: ConnectionError | null = null;
  if (!socket) {
    try {
      const resolved = await resolveAddresses(host, { ...opts.resolve, log });
      socket = await tryAll(resolved, "resolved");
    } catch (err) {
      resolveError = err instanceof ConnectionError ? err : null;
      if (!resolveError) throw err;
    }
  }
  if (!socket) {
    if (reasons.length === 0 && resolveError) throw resolveError;
    const reason = mostSpecific(reasons);
    const detail = [...failures, ...(resolveError ? [resolveError.detail] : [])].join("; ");
    throw new ConnectionError(reason, `Could not connect to ${host} (${detail})`, detail);
  }

  const address = socket.remoteAddress ?? [...tried].pop() ?? host;
  const codec = useTls ? null : new AesHmacCodec(psk, b64urlDecode(dev.iv as string));
  const url = useTls
    ? `wss://${urlHost(host)}:443/homeconnect`
    : `ws://${urlHost(host)}:80/homeconnect`;

  const ws = new WebSocket(url, {
    agent: makeStaticAgent(socket, useTls),
    // No Origin header at all: some firmware rejects an empty one with a 403 (#7).
    rejectUnauthorized: false,
  });

  return { ws, codec, address };
}

// A rejection carries `tcpConnected`, to tell a refused TLS handshake from an unreachable address.
export function connectSocket(
  address: string,
  host: string,
  psk: Buffer,
  useTls: boolean,
  timeoutMs = CONNECT_TIMEOUT_MS,
  port = useTls ? 443 : 80,
): Promise<net.Socket> {
  const socket = useTls
    ? tls.connect({
        host: address,
        port,
        // SNI must be a hostname, never an IP literal.
        ...(net.isIP(host) ? {} : { servername: host }),
        rejectUnauthorized: false,
        // The appliances only speak TLS 1.2 and need the PSK cipher suites.
        ciphers: "ECDHE-PSK-CHACHA20-POLY1305:PSK-AES128-CBC-SHA:PSK",
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.2",
        pskCallback: () => ({ identity: "HCCOM_Local_App", psk }),
      })
    : net.connect({ host: address, port });

  let tcpConnected = false;
  // For TLS, "connect" fires when TCP is up, before the handshake.
  socket.once("connect", () => {
    tcpConnected = true;
  });

  const readyEvent = useTls ? "secureConnect" : "connect";
  return new Promise<net.Socket>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener("close", onClose);
      // Swallow late errors from the socket we are discarding.
      socket.on("error", () => {});
      socket.destroy();
      reject(Object.assign(err, { tcpConnected }));
    };
    const timer = setTimeout(
      () => fail(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    const onError = (err: Error): void => fail(err);
    // A peer that hangs up during the TLS handshake may close without an error.
    const onClose = (): void => fail(Object.assign(new Error("socket closed"), { code: "ECONNRESET" }));
    socket.once(readyEvent, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
      resolve(socket);
    });
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

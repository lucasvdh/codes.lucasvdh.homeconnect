"use strict";

import tls from "tls";
import net from "net";
import http from "http";
import https from "https";
import WebSocket from "ws";

import { DeviceConfig } from "./types";
import { AesHmacCodec, b64urlDecode } from "./aes-hmac-codec";
import { resolveAddresses, urlHost } from "./host-resolver";

const CONNECT_TIMEOUT_MS = 8_000;

export interface OpenedConnection {
  ws: WebSocket;
  /** Present only for the HTTP/AES variant; null for TLS-PSK appliances. */
  codec: AesHmacCodec | null;
}

/**
 * `ws` opens its underlying socket via http(s).Agent.createConnection().
 * We pre-open the (TLS-PSK) socket ourselves and hand the exact same socket
 * back, so `ws` only does the HTTP Upgrade handshake and frame parsing on
 * top of a connection we fully control.
 */
function makeStaticAgent(socket: net.Socket, useTls: boolean): http.Agent {
  const Base = useTls ? https.Agent : http.Agent;
  return new (class extends Base {
    createConnection(): net.Socket {
      // The socket already exists and (for TLS) is already handshaked.
      return socket;
    }
  })({ keepAlive: false });
}

/**
 * Open a local websocket to an appliance. Picks the protocol variant from
 * the device config: an `iv` means the HTTP/AES variant, otherwise TLS-PSK.
 */
export async function openConnection(dev: DeviceConfig): Promise<OpenedConnection> {
  const psk = b64urlDecode(dev.key);
  const useTls = !dev.iv;
  const host = dev.host.trim();

  // Try every resolved address in turn (IPv4 first) until one answers.
  const addresses = await resolveAddresses(host);
  const failures: string[] = [];
  let socket: net.Socket | null = null;
  for (const address of addresses) {
    try {
      socket = await connectSocket(address, host, psk, useTls);
      break;
    } catch (err) {
      failures.push(`${address}: ${(err as Error).message}`);
    }
  }
  if (!socket) {
    throw new Error(`Could not connect to ${host} (${failures.join("; ")})`);
  }

  const codec = useTls ? null : new AesHmacCodec(psk, b64urlDecode(dev.iv as string));
  const url = useTls
    ? `wss://${urlHost(host)}:443/homeconnect`
    : `ws://${urlHost(host)}:80/homeconnect`;

  const ws = new WebSocket(url, {
    agent: makeStaticAgent(socket, useTls),
    // Send no Origin header at all, like hcpy and the official app. An empty
    // Origin is not the same as none: some firmware rejects it with a 403.
    rejectUnauthorized: false,
  });

  return { ws, codec };
}

/** Open the raw (TLS-PSK or plain TCP) socket to one resolved address. */
function connectSocket(
  address: string,
  host: string,
  psk: Buffer,
  useTls: boolean,
): Promise<net.Socket> {
  const socket = useTls
    ? tls.connect({
        host: address,
        port: 443,
        // SNI must be a hostname, never an IP literal.
        ...(net.isIP(host) ? {} : { servername: host }),
        rejectUnauthorized: false,
        // The appliances only speak TLS 1.2 and need the PSK cipher suites.
        ciphers: "ECDHE-PSK-CHACHA20-POLY1305:PSK-AES128-CBC-SHA:PSK",
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.2",
        pskCallback: () => ({ identity: "HCCOM_Local_App", psk }),
      })
    : net.connect({ host: address, port: 80 });

  const readyEvent = useTls ? "secureConnect" : "connect";
  return new Promise<net.Socket>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timed out after ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);
    socket.once(readyEvent, () => {
      clearTimeout(timer);
      socket.removeListener("error", onError);
      resolve(socket);
    });
    const onError = (err: Error): void => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };
    socket.once("error", onError);
  });
}

"use strict";

import tls from "tls";
import net from "net";
import http from "http";
import https from "https";
import WebSocket from "ws";

import { DeviceConfig } from "./types";
import { AesHmacCodec, b64urlDecode } from "./aes-hmac-codec";

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

  let socket: net.Socket;
  let codec: AesHmacCodec | null = null;
  let url: string;

  if (useTls) {
    const tlsSocket = tls.connect({
      host: dev.host,
      port: 443,
      servername: dev.host,
      rejectUnauthorized: false,
      // The appliances only speak TLS 1.2 and need the PSK cipher suites.
      ciphers: "ECDHE-PSK-CHACHA20-POLY1305:PSK-AES128-CBC-SHA:PSK",
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
      pskCallback: () => ({ identity: "HCCOM_Local_App", psk }),
    });
    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", () => resolve());
      tlsSocket.once("error", reject);
    });
    socket = tlsSocket;
    url = `wss://${dev.host}:443/homeconnect`;
  } else {
    codec = new AesHmacCodec(psk, b64urlDecode(dev.iv as string));
    socket = net.connect({ host: dev.host, port: 80 });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });
    url = `ws://${dev.host}:80/homeconnect`;
  }

  const ws = new WebSocket(url, {
    agent: makeStaticAgent(socket, useTls),
    // The official app sends no Origin header; BSH firmware can be picky.
    headers: { Origin: "" },
    rejectUnauthorized: false,
  });

  return { ws, codec };
}

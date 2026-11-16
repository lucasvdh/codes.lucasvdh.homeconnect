"use strict";

/**
 * Why a connection to an appliance failed, as a small fixed set of reasons.
 * Each reason has its own localized "unavailable" message (locales:
 * device.unavailable.<reason>), so a screenshot of the device tells us which
 * step broke instead of one generic "unreachable".
 */
export type ConnectionReason =
  /** No address: the name didn't resolve and no mDNS/pinned address worked. */
  | "resolve_failed"
  /** An address was found, but nothing answered on the port in time. */
  | "connect_timeout"
  /** The address answered with a TCP reset: wrong device, or port closed. */
  | "connection_refused"
  /** The OS reports no route to the address (other network/VLAN, device off). */
  | "host_unreachable"
  /** TCP connected, the TLS-PSK handshake failed: usually a wrong/old key. */
  | "tls_failed"
  /** The websocket upgrade got an HTTP error (e.g. 403). */
  | "ws_rejected"
  /** Connected, then the appliance closed the session. */
  | "closed_by_appliance"
  /** Anything we can't place. */
  | "unknown";

/** An error with a reason attached, thrown by the socket/resolver layer. */
export class ConnectionError extends Error {
  readonly reason: ConnectionReason;
  /** Short technical detail for the log and the settings page, e.g. "ECONNREFUSED". */
  readonly detail: string;

  constructor(reason: ConnectionReason, message: string, detail = "") {
    super(message);
    this.name = "ConnectionError";
    this.reason = reason;
    this.detail = detail;
  }
}

/** How specific a reason is: when several addresses fail, the most specific one wins. */
const SPECIFICITY: Record<ConnectionReason, number> = {
  tls_failed: 7,
  ws_rejected: 6,
  connection_refused: 5,
  connect_timeout: 4,
  host_unreachable: 3,
  closed_by_appliance: 2,
  resolve_failed: 1,
  unknown: 0,
};

/** Pick the most specific reason of several per-address failures. */
export function mostSpecific(reasons: ConnectionReason[]): ConnectionReason {
  return reasons.reduce<ConnectionReason>(
    (best, r) => (SPECIFICITY[r] > SPECIFICITY[best] ? r : best),
    "unknown",
  );
}

const TLS_CODE = /^(ERR_SSL|ERR_TLS|ERR_OSSL)/;

/**
 * Map an error from the socket, TLS or websocket layer to a reason.
 * `tcpConnected` tells a TLS failure apart from a TCP failure: once TCP is up,
 * a reset or timeout means the TLS handshake was refused.
 */
export function classifyError(
  err: unknown,
  opts: { tcpConnected?: boolean } = {},
): { reason: ConnectionReason; detail: string } {
  if (err instanceof ConnectionError) return { reason: err.reason, detail: err.detail };
  const e = (err ?? {}) as NodeJS.ErrnoException;
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : String(err);

  const http = message.match(/Unexpected server response: (\d{3})/);
  if (http) return { reason: "ws_rejected", detail: `HTTP ${http[1]}` };

  if (TLS_CODE.test(code) || /\b(alert|handshake|psk)\b/i.test(message)) {
    return { reason: "tls_failed", detail: code || message };
  }
  if (opts.tcpConnected) {
    // TCP was up, so a reset, close or timeout happened during TLS.
    return { reason: "tls_failed", detail: code || message };
  }
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "EAI_FAIL":
    case "EAI_NONAME":
    case "EAI_NODATA":
      return { reason: "resolve_failed", detail: code };
    case "ECONNREFUSED":
    case "ECONNRESET":
      return { reason: "connection_refused", detail: code };
    case "ETIMEDOUT":
      return { reason: "connect_timeout", detail: code };
    case "EHOSTUNREACH":
    case "ENETUNREACH":
    case "EHOSTDOWN":
    case "ENETDOWN":
      return { reason: "host_unreachable", detail: code };
    default:
      break;
  }
  if (/timed out/i.test(message)) return { reason: "connect_timeout", detail: "timeout" };
  return { reason: "unknown", detail: code || message };
}

/**
 * Reason for a websocket close. Before the handshake finished, a preceding
 * error (e.g. an HTTP 403 on the upgrade) is the better explanation; after
 * it, the appliance ended a working session.
 */
export function classifyClose(
  code: number,
  reason: string,
  opts: { handshakeDone: boolean; lastError?: unknown },
): { reason: ConnectionReason; detail: string } {
  const closeDetail = `close ${code}${reason ? ` ${reason}` : ""}`;
  if (!opts.handshakeDone && opts.lastError) {
    const classified = classifyError(opts.lastError);
    if (classified.reason !== "unknown") return classified;
  }
  if (code === 1008) {
    // Policy violation, e.g. "Header Error": the appliance refused our session.
    return { reason: "ws_rejected", detail: closeDetail };
  }
  return { reason: "closed_by_appliance", detail: closeDetail };
}

"use strict";

// Each reason has its own message (device.unavailable.<reason>), so a screenshot shows
// which step broke.
export type ConnectionReason =
  | "resolve_failed"
  | "connect_timeout"
  | "connection_refused"
  /** Often another network/VLAN, or the appliance is off. */
  | "host_unreachable"
  /** Usually a wrong or outdated key. */
  | "tls_failed"
  | "ws_rejected"
  | "closed_by_appliance"
  | "unknown";

export class ConnectionError extends Error {
  readonly reason: ConnectionReason;
  /** e.g. "ECONNREFUSED" */
  readonly detail: string;

  constructor(reason: ConnectionReason, message: string, detail = "") {
    super(message);
    this.name = "ConnectionError";
    this.reason = reason;
    this.detail = detail;
  }
}

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

export function mostSpecific(reasons: ConnectionReason[]): ConnectionReason {
  return reasons.reduce<ConnectionReason>(
    (best, r) => (SPECIFICITY[r] > SPECIFICITY[best] ? r : best),
    "unknown",
  );
}

const TLS_CODE = /^(ERR_SSL|ERR_TLS|ERR_OSSL)/;

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

// Before the handshake, a preceding error (an HTTP 403 on the upgrade) explains the close better.
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

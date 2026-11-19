"use strict";

// Long enough that a router restart or a firmware reboot doesn't reach the user's flows.
export const UNREACHABLE_REPORT_MS = 5 * 60_000;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class ReachabilityReporter<Reason> {
  private timer: unknown = null;
  private reported = false;
  private reason: Reason | undefined;

  constructor(
    private readonly onChange: (reachable: boolean, reason?: Reason) => void,
    private readonly timers: Timers,
    private readonly delayMs = UNREACHABLE_REPORT_MS,
  ) {}

  unavailable(reason: Reason): void {
    this.reason = reason;
    if (this.timer || this.reported) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.reported = true;
      this.onChange(false, this.reason);
    }, this.delayMs);
  }

  connected(): void {
    this.stop();
    if (!this.reported) return;
    this.reported = false;
    this.onChange(true);
  }

  stop(): void {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }
}

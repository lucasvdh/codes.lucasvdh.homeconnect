export type HoodMode = "Off" | "Venting" | "Automatic" | "DelayedShutOff";

const PROGRAM_MODES = new Set<string>(["Venting", "Automatic", "DelayedShutOff"]);

// After a mode is picked the hood first keeps reporting its old state for a moment.
export const MODE_SETTLE_MS = 15_000;

export interface PickedMode {
  mode: HoodMode;
  atMs: number;
}

/** null: a program runs that has no mode in the picker. */
export function hoodModeFor(running: boolean, program: unknown): HoodMode | null {
  if (!running) return "Off";
  return typeof program === "string" && PROGRAM_MODES.has(program) ? (program as HoodMode) : null;
}

/** undefined: keep what the picker shows. */
export function modeToShow(
  reported: HoodMode | null,
  picked: PickedMode | null,
  nowMs: number,
): HoodMode | null | undefined {
  const settling = picked != null && nowMs - picked.atMs < MODE_SETTLE_MS;
  if (settling && reported !== picked.mode) return undefined;
  return reported;
}

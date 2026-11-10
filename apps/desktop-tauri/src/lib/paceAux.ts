import type { LocaleKey } from "../i18n/keys";
import { formatDuration, formatEta } from "./formatEta";

export interface PaceTiming {
  stage: string;
  etaSeconds: number | null;
  willLastToReset: boolean;
  elapsedSeconds?: number | null;
  resetsInSeconds?: number | null;
  actualUsedPercent?: number | null;
}

/** Stages consuming faster than expected (delta above +2%). */
const AHEAD_STAGES: ReadonlySet<string> = new Set([
  "slightly_ahead",
  "ahead",
  "far_ahead",
]);

/**
 * Rest time until an ahead lane rejoins the on-track pace assuming zero
 * usage: expected(t) catches up to actual at
 * `t = actual% × duration − elapsed`. Null when not computable or when even
 * full rest cannot rejoin before the reset (e.g. exhausted).
 */
export function restToRejoinSeconds(pace: PaceTiming): number | null {
  if (!AHEAD_STAGES.has(pace.stage)) return null;
  const { actualUsedPercent: actual, elapsedSeconds: elapsed, resetsInSeconds: resets } = pace;
  if (
    actual == null ||
    elapsed == null ||
    resets == null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(elapsed) ||
    !Number.isFinite(resets) ||
    elapsed < 0 ||
    resets <= 0
  ) {
    return null;
  }
  const rest = (actual / 100) * (elapsed + resets) - elapsed;
  return rest > 0 && rest < resets ? rest : null;
}

/**
 * Personal: always-visible one-line pace summary — verdict first, then
 * reset-remaining, then parenthesized elapsed time:
 * `Runs out in 38m / 45m reset remaining (4h 32m elapsed)`,
 * `Will last to reset / 45m reset remaining (4h 32m elapsed)`.
 * Returns null when there is nothing to show.
 */
export function formatPaceAux(
  pace: PaceTiming,
  t: (key: LocaleKey) => string,
): string | null {
  const parts: string[] = [];
  if (pace.etaSeconds != null && !pace.willLastToReset) {
    parts.push(`${t("DetailPaceRunsOutIn")} ${formatEta(pace.etaSeconds)}`);
  } else if (pace.willLastToReset) {
    parts.push(t("DetailPaceWillLastToReset"));
  }
  const resetsIn = formatDuration(pace.resetsInSeconds);
  if (resetsIn != null) {
    parts.push(t("DetailPaceResetRemaining").replace("{}", resetsIn));
  }
  const elapsed = formatDuration(pace.elapsedSeconds);
  if (elapsed != null) {
    const elapsedPart = `(${t("DetailPaceElapsed").replace("{}", elapsed)})`;
    // Elapsed time hugs the reset-remaining part with a space instead of
    // starting a new slash segment: `… 1h 30m reset remaining (3h 20m elapsed)`.
    if (parts.length > 0) {
      parts[parts.length - 1] += ` ${elapsedPart}`;
    } else {
      parts.push(elapsedPart);
    }
  }
  const rest = restToRejoinSeconds(pace);
  if (rest != null) {
    parts.push(t("DetailPaceRestToTrack").replace("{}", formatDuration(rest) ?? "?"));
  }
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

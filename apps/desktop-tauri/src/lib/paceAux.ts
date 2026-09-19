import type { LocaleKey } from "../i18n/keys";
import { formatDuration, formatEta } from "./formatEta";

export interface PaceTiming {
  etaSeconds: number | null;
  willLastToReset: boolean;
  elapsedSeconds?: number | null;
  resetsInSeconds?: number | null;
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
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

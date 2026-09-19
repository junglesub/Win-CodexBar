import type { LocaleKey } from "../i18n/keys";
import { formatDuration, formatEta } from "./formatEta";

export interface PaceTiming {
  etaSeconds: number | null;
  willLastToReset: boolean;
  elapsedSeconds?: number | null;
  resetsInSeconds?: number | null;
}

/**
 * Personal: always-visible one-line pace summary — verdict plus elapsed
 * window time and time left until reset on the same line:
 * `Runs out in 49m / 3h 20m elapsed / reset remaining 1h 30m`,
 * `Will last to reset / 3h 20m elapsed / reset remaining 1h 40m`.
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
  const elapsed = formatDuration(pace.elapsedSeconds);
  if (elapsed != null) {
    parts.push(t("DetailPaceElapsed").replace("{}", elapsed));
  }
  const resetsIn = formatDuration(pace.resetsInSeconds);
  if (resetsIn != null) {
    parts.push(t("DetailPaceResetRemaining").replace("{}", resetsIn));
  }
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

import { describe, expect, it } from "vitest";
import { formatPaceAux } from "./paceAux";
import type { LocaleKey } from "../i18n/keys";

const entries: Record<string, string> = {
  DetailPaceRunsOutIn: "Runs out in",
  DetailPaceWillLastToReset: "Will last to reset",
  DetailPaceElapsed: "{} elapsed",
  DetailPaceResetRemaining: "{} reset remaining",
};

const t = (key: LocaleKey) => entries[key] ?? key;

describe("formatPaceAux", () => {
  it("combines verdict, elapsed, and reset-remaining on one line", () => {
    expect(
      formatPaceAux(
        {
          etaSeconds: 49 * 60,
          willLastToReset: false,
          elapsedSeconds: 3 * 3600 + 20 * 60,
          resetsInSeconds: 90 * 60,
        },
        t,
      ),
    ).toBe("Runs out in 49m / 1h 30m reset remaining (3h 20m elapsed)");
  });

  it("shows elapsed time next to the will-last verdict", () => {
    expect(
      formatPaceAux(
        {
          etaSeconds: null,
          willLastToReset: true,
          elapsedSeconds: 12_000,
          resetsInSeconds: 6000,
        },
        t,
      ),
    ).toBe("Will last to reset / 1h 40m reset remaining (3h 20m elapsed)");
  });

  it("falls back to verdict only without timing data", () => {
    expect(
      formatPaceAux({ etaSeconds: 5400, willLastToReset: false }, t),
    ).toBe("Runs out in 2h");
  });

  it("returns null when there is nothing to show", () => {
    expect(formatPaceAux({ etaSeconds: null, willLastToReset: false }, t)).toBeNull();
  });
});

# Float Bar Three-Window Usage Design

## Goal

Make every Float Bar provider pill explain its quota basis by reserving three fixed positions for 5-hour, weekly, and monthly usage.

## Display Contract

- Render slots in the fixed order `5h / weekly / monthly`.
- Show rounded consumed quota percentages, for example `23% / 41% / 8%`.
- Show `—` when the provider does not expose a matching quota window.
- Ignore cost data, local 30-day estimates, model-specific windows, and extra rate windows.
- Ignore the global `showAsUsed` setting: these three values are always used percentages.
- Keep cadence names out of the compact visible text. Each slot's tooltip and accessible name must identify its cadence, used percentage, and reset time.

## Window Selection

Inspect canonical windows in order: `primary`, `secondary`, then `tertiary`. Informational windows do not represent quota and are treated as absent.

Classify a window by `windowMinutes` when present:

- exactly `300`: 5-hour
- `10,080` through `40,319`: weekly
- `40,320` through `44,640`: monthly (actual 28-31 day Gregorian months)
- every other known duration: unsupported

Only when `windowMinutes` is absent, use the corresponding provider label as a fallback. Recognize labels that explicitly identify a 5-hour (`5h`, `5-hour`, or `5 hour`), weekly (`weekly` or `7-day`), or monthly cadence. Do not infer cadence from generic labels such as `Session`, `Usage`, or `Quota`.

If multiple canonical windows resolve to the same cadence, keep the first match. This preserves the provider's canonical slot priority without inventing merge behavior.

## Reset-Time Behavior

When `floatBarShowResetInline` is disabled, every available slot displays its percentage.

When it is enabled, append one compact locale-independent countdown unit beside each slot's percentage if that window has a parseable `resetsAt` strictly in the future, for example `75% 30m`, `75% 1h`, or `75% 1d`. Use floor semantics and never combine units: under 60 minutes renders `Xm`, under 24 hours renders `Xh`, and 24 hours or more renders `Xd`. A missing, invalid, or expired timestamp leaves the percentage visible without a countdown. Backend `resetDescription` alone is not enough to add a countdown because it cannot guarantee a live relative value.

The tooltip and accessible name keep the full localized reset detail alongside the used percentage.

## Ordering and Status

- Sort providers descending by the highest available used percentage across the three slots.
- Derive warning and critical tones from the same highest percentage using the existing thresholds.
- Preserve critical styling for provider errors and render `— / — / —`.
- Providers with no recognized canonical window remain visible with `— / — / —`.

## Scope and Constraints

- Keep classification and rendering local to the Float Bar; no shared API is required yet.
- Do not change Rust providers, Tauri bridge DTOs, settings schemas, or other surfaces.
- Add no dependencies.
- Update the existing architecture documentation when the behavior ships.
- Run focused frontend tests only. Do not build or run CUA proof unless the user separately authorizes a fresh desktop build.

## Acceptance Criteria

1. Every enabled provider renders exactly three fixed usage positions.
2. Known 5-hour, weekly, and monthly canonical windows appear in the correct positions regardless of whether the provider stored them as primary, secondary, or tertiary.
3. Unsupported, informational, or missing windows appear as `—`.
4. Inline reset mode appends a single largest-unit countdown beside each eligible percentage while retaining full localized reset detail in the tooltip/accessibility context.
5. Sorting and status color use the highest recognized used percentage.
6. Existing provider filtering, cost pills, dragging, orientation, scaling, and refresh behavior remain unchanged.

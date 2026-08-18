# Float Bar Three-Window Usage Design

## Goal

Make every Float Bar provider pill explain its quota basis by reserving three fixed positions for 5-hour, weekly, and monthly usage.

## Display Contract

- Render slots in the fixed order `5h / weekly / monthly`.
- Show rounded consumed quota percentages, for example `23% / 41% / 8%`.
- Show `—` when the provider does not expose a matching quota window.
- Ignore cost data, local 30-day estimates, and extra rate windows.
- Ignore the global `showAsUsed` setting: these three values are always used percentages.
- Keep cadence names out of the compact visible text. Each slot's tooltip and accessible name must identify its cadence, used percentage, and reset time.

## Cadence-Less Fallback

When a provider's canonical windows carry no recognizable cadence (all three fixed slots are empty), render one visibly labeled fallback metric instead of `— / — / —`.

The fallback honors the per-provider `providerMetrics` preference in `settings` when that window exists and is not informational:

- `session` → `primary`
- `weekly` → `secondary`
- `model` → `modelSpecific`
- `tertiary` → `tertiary`

`automatic` (the default), a missing/informational requested window, or an unsupported preference falls back to the automatic order: `modelSpecific` → `primary` → `secondary` → `tertiary` (first non-informational window). No provider is hardcoded; this makes a provider such as Antigravity default to its model-specific window (e.g. Gemini Flash) while explicit Session/Weekly/Model selections pick primary/secondary/modelSpecific respectively.

The fallback metric is labeled with the window identity (Session / Weekly / Model-specific / Tertiary) using existing localized strings, participates in inline reset countdowns, and drives effective sorting/tone/error behavior like a normal slot.

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

When it is enabled, independently replace each slot's percentage with a compact relative countdown if that window has a parseable `resetsAt` strictly in the future. Multiple slots may display countdowns simultaneously, for example `2h 5m / 1d 4h / 12d 3h`. A missing, invalid, or expired timestamp leaves the percentage visible. Backend `resetDescription` alone is not enough to replace a percentage because it cannot guarantee a live relative countdown.

The tooltip and accessible name retain the used percentage even while the visible value is a countdown.

## Ordering and Status

- Sort providers descending by the highest available used percentage across the three slots (or the fallback metric when cadence-less).
- Derive warning and critical tones from the same highest percentage using the existing thresholds.
- Preserve critical styling for provider errors and render `— / — / —`.
- Providers with no recognized canonical window show the cadence-less fallback (or `—` when no window exists at all).

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
4. Inline reset mode replaces every eligible slot with its own live relative countdown while retaining full tooltip/accessibility context.
5. Sorting and status color use the highest recognized used percentage.
6. Existing provider filtering, cost pills, dragging, orientation, scaling, and refresh behavior remain unchanged.
7. Cadence-less providers render one visibly labeled fallback metric honoring `providerMetrics` (session/weekly/model/tertiary), with automatic falling back to modelSpecific → primary → secondary → tertiary.

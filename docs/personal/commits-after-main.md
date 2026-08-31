# Personal branch commits after `main`

Catalog of every commit on `personal` that is not on `origin/main`. Use this file when updating `main` from upstream (`nesszer/Win-CodexBar`) and then bringing that `main` into `personal`. The goal is to judge **business-logic and concept collisions**, not just textual git conflicts.

Generated from:

| Ref | SHA | Subject / date |
| --- | --- | --- |
| Fork point (`origin/main`, merge-base) | `526ad1be` | `feat: show DeepSeek peak and off-peak pricing (#280)` (2026-08-16) |
| `personal` HEAD | `ba637a40` | `Add floating bar background color and opacity settings` (2026-08-20) |
| Range | `origin/main..personal` | **35 commits** (34 regular + 1 merge) |

At generation time, `origin/main` had **not moved** past the fork point (`526ad1be..origin/main` is empty). That will change when `main` is fast-forwarded from upstream.

Commits are listed **oldest first**. Author is `junglesub` / Jungsub Ryoo throughout.

---

## How to use this document

1. When upstream/`main` changes a file or concept listed under **Collision risk**, read the matching commits here before merging.
2. Treat **concept** collisions as more important than line conflicts. A clean merge can still invert Float Bar semantics, Antigravity quota mapping, or updater behavior.
3. Theme tags:

   - `float-bar-usage` — overlay quota display model
   - `antigravity` — Gemini quota fetch / CLI detection
   - `identity-updater` — fork identity and disabled in-app updates
   - `release-ci` — personal GitHub Actions, installer, CodeRabbit
   - `settings-ui` — Float Bar appearance settings
   - `docs` — README / architecture / design specs only

---

## Concept snapshot (personal vs current `main`)

These are the durable product rules `personal` added. If a later `main` commit changes the same rule, it is a concept collision even when the files still merge.

### 1. Float Bar quota display (`float-bar-usage`)

On `main`, each provider pill shows **one** metric via `selectSingleMetricUsageWindow`: remaining or used percent (`showAsUsed`), pill-level warn/crit tone from remaining, optional inline reset icon + localized prose.

On `personal`, the pill is a **three-slot used-quota strip**:

| Rule | Personal behavior |
| --- | --- |
| Slots | Fixed order `5h / weekly / monthly` |
| Values | Always **consumed** percent; global `showAsUsed` is ignored |
| Missing / informational / unsupported | `—` |
| Classification | `windowMinutes` wins: `300` → 5h; `10,080`–`40,319` → weekly; `40,320`–`44,640` → monthly; anything else unsupported. Label fallback only if minutes are absent (`5h`/`5-hour`, `weekly`/`7-day`, `monthly`). First canonical match (`primary` → `secondary` → `tertiary`) wins per cadence |
| Cadence-less fallback | If **all three slots empty**, show a **single** labeled metric: explicit `providerMetrics` preference if usable, else `modelSpecific` → `primary` → `secondary` → `tertiary` (skip informational) |
| Inline reset | When `floatBarShowResetInline`, append a locale-independent countdown (`Nm` / `Nh` / `Nd`, largest unit only) **beside** the percent. Tooltip still has localized reset text |
| Color | Pill/icon stay neutral; **each metric** is ok/warn/crit from **its own** used percent vs `highUsageThreshold` / `criticalUsageThreshold` |
| Sort | Highest used percent among recognized slots (or the fallback) |
| Errors | Provider error still crit-styles metrics; Antigravity “language server not running” replaces metrics with overlay copy `FloatBarAgyRunNeeded` |
| Hover | Per-slot cadence/used/reset plus relative last-updated from `updatedAt` (30s shared clock) |
| Out of scope | Cost pills stay separate. Extra rate windows never fill the three slots. `modelSpecific` is fallback-only |

Local implementation: `apps/desktop-tauri/src/floatbar/FloatBar.tsx` only. Shared `usageWindows.ts` and other surfaces were not switched to this model.

### 2. Antigravity usage source (`antigravity`)

Prefer local `RetrieveUserQuotaSummary` and map **Gemini Models** group:

- five-hour bucket → `primary` (`windowMinutes = 300`)
- weekly bucket → `secondary` (`windowMinutes = 10_080`)
- monthly absent; `model_specific` **never** filled from a successful summary
- accept `remainingFraction` direct or nested; most constrained usable bucket wins per cadence
- fall back to legacy `GetUserStatus` / model parse on transport error, non-success (including IDE 404), parse failure, missing Gemini group, or unusable Gemini bucket
- `agy` stays tokenless; desktop keeps CSRF + token retry
- CLI process match tightened (`agy.exe` / `antigravity-cli` with quoted-path boundaries)

### 3. Fork identity and updater (`identity-updater`)

Canonical repo `junglesub/Win-CodexBar`, site `https://junglesub.github.io/Win-CodexBar/`. Keep `steipete/CodexBar` credit, `nesszer/Win-CodexBar` as upstream-sync source, `Finesssee.Win-CodexBar` as Winget ID.

In-app updater **activation is disabled** (startup check, About controls, tray “Check for Updates”, quit-install, banners). Implementation, commands, settings fields, and DTOs remain. Dormant GitHub repo constant points at `junglesub/Win-CodexBar`. Rolling `personal-latest` GitHub release is independent of the app updater.

### 4. Personal delivery (`release-ci`)

CircleCI release path removed. GitHub Actions `personal-release.yml` builds on `personal` and **replaces** the rolling `personal-latest` prerelease in place. Optional `irm … \| iex` installer (`scripts/install-personal.ps1`). `upstream-sync.yml` ff-only-updates `main` from `nesszer/Win-CodexBar` and opens a PR into `personal`. Hosted `pr-check.yml` was deleted then replaced with a slimmer personal workflow.

### 5. Float Bar background (`settings-ui`)

New settings: `floatBarBackgroundColor` (`#RRGGBB`, default `#FFFFFF`) and `floatBarBackgroundOpacity` (`0..=100`, default `8`). Independent of whole-window `floatBarOpacity`. Invalid colors normalize to white.

---

## DAG note (one merge)

After `9f5efe22` the history splits:

```
9f5efe22 Rewrite README for Float Bar branch
 ├─ be0f554d fallback metric
 │    94e6bb24 notify on providerMetrics
 │    a02a6fa6 simplify fallback
 │    de878a3d per-metric color
 │    c618d5a7 tone-class tests          ← feat-overlay
 └─ af70f66e countdown beside %
      fe468515 relative refresh tooltip  ← temp-2

6c2703bb Merge branch 'temp-2' into feat-overlay
```

Both sides must be treated as landed. The merge resolution is the source of truth for combined tooltip + fallback + coloring.

---

## Per-commit catalog

### `aab733d1` — Document Float Bar usage plan

- **Date:** 2026-08-18 12:09 +0900
- **Theme:** `docs` / `float-bar-usage`
- **Files:** `docs/superpowers/plans/2026-08-18-float-bar-three-window-usage.md` (added), `docs/superpowers/specs/2026-08-18-float-bar-three-window-usage-design.md` (added)
- **What changed:** Spec/plan for three fixed Float Bar quota slots. Original contract: ignore `showAsUsed`, ignore cost / local 30-day / model-specific / extra windows, classify by `windowMinutes` then labels, first-match per cadence, inline reset **replaces** percent, sort/color by max used percent, Float Bar–local only (no Rust/DTO/settings changes).
- **Collision risk:** Low as files. **High as intent** — later commits amended this spec (month bounds, fallback, append-not-replace reset, per-metric color, `modelSpecific` fallback). Prefer the **final** rules in the concept snapshot, not this first draft.

### `7d060749` — Show Float Bar usage windows and reset countdowns

- **Date:** 2026-08-18 12:26 +0900
- **Theme:** `float-bar-usage`
- **Files:** `FloatBar.tsx`, `FloatBar.css`, `FloatBar.test.tsx`
- **What changed:** First implementation. Stopped using `selectSingleMetricUsageWindow`. Added `cadenceFromMinutes` / `cadenceFromLabel` / `selectFloatBarUsageSlots` / `UsageMetric`. Pill renders `5h / weekly / monthly`. Tone from max used vs usage thresholds (not remaining). Error/exhausted → `— / — / —`. Monthly initially `>= 43_200` minutes. Inline reset **replaced** the percent using localized `inlineResetTime`. Sorting by max used percent.
- **Collision risk:** **High.** Any upstream change to Float Bar pills, `showAsUsed`, remaining-based thresholds, or `selectSingleMetricUsageWindow` usage in `FloatBar.tsx` collides with this model.

### `19cf0b3c` — Document Float Bar usage windows

- **Date:** 2026-08-18 12:26 +0900
- **Theme:** `docs`
- **Files:** `docs/ARCHITECTURE.md` (+1 line under float bar data flow)
- **What changed:** Architecture note for three-window Float Bar rendering.
- **Collision risk:** Medium if upstream rewrites the Float Bar architecture paragraph.

### `8e36bc87` — Fix Float Bar cadence labels and error precedence

- **Date:** 2026-08-18 12:32 +0900
- **Theme:** `float-bar-usage`
- **Files:** `FloatBar.tsx`, `FloatBar.test.tsx`
- **What changed:** Label regex accepts `5-hour`. Error/missing windows always show `—` **before** considering inline reset (reset must not hide an error dash).
- **Collision risk:** High (same file as 7d060749). Semantic: error beats reset text.

### `2ce05460` — Fix Float Bar month thresholds and pill detail

- **Date:** 2026-08-18 12:59 +0900
- **Theme:** `float-bar-usage`
- **Files:** `FloatBar.tsx`, tests, spec/plan
- **What changed:** Monthly threshold lowered to `>= 40_320` (28-day months). Compact visible countdown is **locale-independent** (`compactResetTime`) instead of stripping English “resets in …”. Per-metric `title`/`aria-label` removed (children have `pointer-events: none`); full cadence/used/reset detail moved to the **pill**. Reintroduced `resetTimeRelative` for tooltip localization.
- **Collision risk:** High. Month window classification and tooltip ownership.

### `1c2e1d06` — Bound Float Bar month range and fix group semantics

- **Date:** 2026-08-18 13:05 +0900
- **Theme:** `float-bar-usage`
- **Files:** `FloatBar.tsx`, tests, spec/plan
- **What changed:** Monthly is **closed range** `40_320..=44_640`; weekly `10_080..<40_320`; longer windows are unsupported (not monthly). Root Float Bar and pills use `role="group"` instead of `role="button"`.
- **Collision risk:** High. Cadence classification is a merge-sensitive invariant.

### `9f5efe22` — Rewrite README for Float Bar branch

- **Date:** 2026-08-18 13:10 +0900
- **Theme:** `docs`
- **Files:** `README.md` (large rewrite)
- **What changed:** README retargeted to this Float Bar overlay fork (later rewritten again for the personal product).
- **Collision risk:** High **textual** conflict with any upstream README change. Concept: personal README is no longer a mirror of Win-CodexBar `main`.

### `be0f554d` — Add cadence-less Float Bar fallback metric

- **Date:** 2026-08-18 13:45 +0900
- **Theme:** `float-bar-usage`
- **Parent:** `9f5efe22` (parallel to `af70f66e`)
- **Files:** `FloatBar.tsx/.css/.test.tsx`, README, spec/plan, locale FTL (`ProviderSessionLabel` etc.)
- **What changed:** If no recognized 5h/weekly/monthly slot exists, render **one** labeled fallback. Preference order: explicit `settings.providerMetrics` (`session`/`weekly`/`model`/`tertiary`) if that window is non-informational; else automatic `modelSpecific` → `primary` → `secondary` → `tertiary`. Sort/tone include the fallback. Visible label uses a generic locale key in this commit (later prefers provider labels).
- **Collision risk:** **High.** Interacts with `providerMetrics`, `modelSpecific`, and providers that only expose session/model windows (Codex, Claude, etc.). Upstream changing Float Bar to a different single-metric rule will fight this.

### `af70f66e` — Show reset countdowns beside usage

- **Date:** 2026-08-18 13:55 +0900
- **Theme:** `float-bar-usage`
- **Parent:** `9f5efe22` (parallel to `be0f554d`; **does not** include fallback)
- **Files:** `FloatBar.tsx`, tests, `bridge.ts` comment, README, ARCHITECTURE, spec/plan
- **What changed:** Inline reset **appends** after the percent (`23% 2h`) instead of replacing it. Compact form uses **one largest unit** (`m` / `h` / `d`). Settings comment for `floatBarShowResetInline` updated.
- **Collision risk:** High vs any Float Bar reset-inline UX on `main` (icon + replaced percent + English strip).

### `94e6bb24` — Notify Float Bar on provider metric changes

- **Date:** 2026-08-18 13:57 +0900
- **Theme:** `float-bar-usage` / `settings-ui`
- **Parent:** `be0f554d`
- **Files:** `commands/settings.rs`, `FloatBar.tsx`, tests
- **What changed:** `SettingsUpdate.provider_metrics` now flags `notifies_float_bar()` so the overlay reloads when the user changes per-provider metric preference. Fallback visible label prefers `primaryLabel`/`secondaryLabel`/`tertiaryLabel`; `modelSpecific` still uses the generic key.
- **Collision risk:** Medium–high. Upstream `notifies_float_bar()` / `provider_metrics` wiring in `settings.rs` can drop this notification and leave the overlay stale.

### `a02a6fa6` — Simplify Float Bar fallback selection

- **Date:** 2026-08-18 14:01 +0900
- **Theme:** `float-bar-usage`
- **Files:** `FloatBar.tsx` only
- **What changed:** Refactor of `fallbackFor`: one candidate list; preference picks an index, then the same automatic scan. Behavior intended to be identical.
- **Collision risk:** Same as fallback commits (file-level). Low new semantics.

### `fe468515` — Show relative refresh time in Float Bar tooltip

- **Date:** 2026-08-18 14:20 +0900
- **Theme:** `float-bar-usage`
- **Parent:** `af70f66e` (`temp-2` line)
- **Files:** `FloatBar.tsx`, tests, README, ARCHITECTURE
- **What changed:** Pill tooltip/aria-label appends `LastUpdated: <relative>`. Shared 30-second `now` clock so text advances without per-pill timers. Unparseable `updatedAt` shown raw.
- **Collision risk:** Medium. Tooltip string format; shared interval vs other Float Bar timers.

### `de878a3d` — Color Float Bar usage metrics individually

- **Date:** 2026-08-18 14:28 +0900
- **Theme:** `float-bar-usage`
- **Parent:** `a02a6fa6`
- **Files:** `FloatBar.tsx`, `FloatBar.css`, README, spec/plan
- **What changed:** Dropped pill-level `--ok/--warn/--crit`. Each `UsageMetric` colors from **its own** used percent (or error/exhausted → crit). Container/icon stay neutral.
- **Collision risk:** **High.** `main` still colors the whole pill from one remaining percent. CSS class contract (`floatbar__pill--*`) is gone on personal.

### `c618d5a7` — Assert per-metric Float Bar tone classes

- **Date:** 2026-08-18 14:33 +0900
- **Theme:** `float-bar-usage`
- **Files:** `FloatBar.test.tsx` only
- **What changed:** Tests that warn/crit classes attach to individual metrics, not the pill.
- **Collision risk:** Tests will fail if upstream or a merge restores pill-level tone.

### `6c2703bb` — Merge branch `temp-2` into `feat-overlay`

- **Date:** 2026-08-18 14:49 +0900
- **Theme:** `float-bar-usage`
- **Parents:** `c618d5a7` + `fe468515`
- **What changed:** Combined fallback + per-metric color with append-style reset + relative last-updated tooltip. Resulting combined behavior is the concept snapshot above.
- **Collision risk:** Treat as the integration point. Re-merging Float Bar from `main` should start from this combined contract, not either parent.

### `58c77e48` — Clarify Float Bar modelSpecific fallback docs

- **Date:** 2026-08-18 14:54 +0900
- **Theme:** `docs` / `float-bar-usage`
- **Files:** README, ARCHITECTURE, spec/plan
- **What changed:** Docs now say `modelSpecific` is used **only** as the cadence-less single fallback, not as a fourth fixed slot. Extra windows still out of scope.
- **Collision risk:** Doc wording vs any upstream “ignore model-specific entirely” statement.

### `bc595aaa` — Prefer Antigravity quota summary for Gemini usage

- **Date:** 2026-08-18 15:47 +0900
- **Theme:** `antigravity`
- **Files:** `rust/src/providers/antigravity/mod.rs`, tests, `docs/PROVIDERS.md`, READMEs
- **What changed:** Fetch path renamed to `fetch_usage_snapshot`: try `RetrieveUserQuotaSummary` first, map Gemini 5h/weekly buckets as in the concept snapshot, otherwise unchanged `GetUserStatus` model parse. CSRF/token rules preserved. Successful summary never fills monthly or `model_specific` (so Float Bar 5h/weekly slots fill from `windowMinutes`; monthly stays `—`; fallback does not pick a summary-derived model window).
- **Collision risk:** **High.** Any upstream Antigravity parser, endpoint, Gemini vs Claude group mapping, or `primary`/`secondary`/`model_specific` assignment will conceptually conflict. This is the main **provider-data** collision surface with `main`.

### `bb7b4a78` — Apply review corrections to Antigravity quota summary

- **Date:** 2026-08-18 16:04 +0900
- **Theme:** `antigravity`
- **Files:** `antigravity/mod.rs`, tests, `rust/README.md`
- **What changed:** Error path no longer logs/embeds quota-summary **response body**. `disabled` field dropped from bucket struct. `usable_fraction` clamps any finite value to `0..=1` (out-of-range no longer rejected as unusable).
- **Collision risk:** High (same module). Semantic: more buckets become usable after clamp.

### `e2a46871` — Enhance README with Korean description and title

- **Date:** 2026-08-18 16:59 +0900
- **Theme:** `docs`
- **Files:** `README.md`
- **What changed:** Korean title/description for the Float Bar overlay fork.
- **Collision risk:** README textual. Later `cbc2caea` / `acccc72e` rewrite this again.

### `ca40b594` — Delete `.github` directory

- **Date:** 2026-08-18 17:01 +0900
- **Theme:** `release-ci`
- **Files:** deleted `.github/workflows/pr-check.yml`, `interaction-guard.yml`, issue/PR templates, dependabot, `CI.md`, guard scripts
- **What changed:** Removed the inherited GitHub automation (including hosted PR check and interaction guard).
- **Collision risk:** **High process collision.** Upstream will keep/change `.github/**`. Personal later re-added a different `pr-check.yml` plus new workflows. Merging `main` will resurrect templates, dependabot, interaction-guard, and the full Blacksmith PR gate unless you deliberately keep the personal set.

### `44a48edc` — Migrate personal releases to GitHub Actions

- **Date:** 2026-08-18 20:09 +0900
- **Theme:** `release-ci`
- **Files:** added `.github/workflows/personal-release.yml`; deleted `.circleci/config.yml` and CircleCI release scripts (`circleci-release-build.ps1`, `publish-github-release.ps1`, `emit-release-manifest.ps1`, `release-preflight.ps1`); docs ADRs/`CONTEXT.md`/`docs/release/ci-cd.md`
- **What changed:** Personal Windows release builds on GitHub Actions (`windows-2025`) using `scripts/windows-release-build.ps1`. CircleCI is no longer the personal trust boundary.
- **Collision risk:** High vs upstream CircleCI/Blacksmith release docs and any restore of `.circleci`. Personal delivery must not be replaced by upstream’s hosted-release model without an explicit decision.

### `5b11cfcb` — Handle missing rolling release probe

- **Date:** 2026-08-18 20:17 +0900
- **Theme:** `release-ci`
- **Files:** `personal-release.yml`, `scripts/release-pipeline.tests.ps1`
- **What changed:** First-run / missing rolling `personal-latest` probe no longer fails the workflow.
- **Collision risk:** Isolated to personal workflow.

### `81402fe5` — Avoid failing rolling release probes `[skip ci]`

- **Date:** 2026-08-18 21:04 +0900
- **Theme:** `release-ci`
- **Files:** `personal-release.yml`, tests
- **What changed:** Further hardening so rolling-release existence probes do not fail the job.
- **Collision risk:** Isolated to personal workflow.

### `53015f90` — Add personal release installer `[skip ci]`

- **Date:** 2026-08-18 21:52 +0900
- **Theme:** `release-ci`
- **Files:** `scripts/install-personal.ps1`, tests, design spec, README
- **What changed:** User-run PowerShell installer that downloads the `personal-latest` GitHub Setup.exe + sha256 (HTTPS only, exact one installer + checksum). Independent of the in-app updater.
- **Collision risk:** Low vs app code. Medium vs docs/privacy (explicit GitHub contact). Do not conflate with Winget/`Finesssee` installer.

### `cbc2caea` — Simplify personal branch README `[skip ci]`

- **Date:** 2026-08-18 22:08 +0900
- **Theme:** `docs`
- **Files:** `README.md` (cut from overlay-spec dump to a short personal-fork README)
- **What changed:** README becomes the personal-fork landing page, not the three-window design dump.
- **Collision risk:** High textual vs upstream README.

### `d2e164a3` — Configure CodeRabbit and add PR-check + upstream-sync `[skip ci]`

- **Date:** 2026-08-18 22:53 +0900
- **Theme:** `release-ci`
- **Files:** `.coderabbit.yaml`, `.github/workflows/pr-check.yml` (re-added), `.github/workflows/upstream-sync.yml`
- **What changed:**
  - Slim personal `pr-check.yml` (not necessarily identical to upstream Blacksmith budget gate).
  - `upstream-sync.yml`: weekly (Mon 03:00 Asia/Seoul) + dispatch; ff-only `origin/main` from `nesszer/Win-CodexBar` `main`; open/update a normal merge PR `sync/upstream` → `personal`.
  - Initial CodeRabbit config.
- **Collision risk:** **High** for `.github/workflows/pr-check.yml` (two different gates). `upstream-sync.yml` is personal-only; keep it. CodeRabbit is personal-only.

### `be9268fe` — CodeRabbit minimal quiet mode `[skip ci]`

- **Date:** 2026-08-18 23:04 +0900
- **Theme:** `release-ci`
- **Files:** `.coderabbit.yaml`
- **What changed:** Reviews limited to actionable integration risks; quieter/minimal mode.
- **Collision risk:** None with product logic.

### `8074fef5` — Add Antigravity usage doctor

- **Date:** 2026-08-19 09:15 +0900
- **Theme:** `antigravity`
- **Files:** `scripts/antigravity-doctor.ps1`, `docs/PROVIDERS.md`
- **What changed:** Local diagnostic script for Antigravity language-server / quota endpoints. Does not change fetch logic.
- **Collision risk:** Low. Docs mention in `PROVIDERS.md` may conflict with upstream provider docs edits.

### `7d57b026` — Fix Antigravity CLI detection and overlay

- **Date:** 2026-08-19 10:30 +0900
- **Theme:** `antigravity` / `float-bar-usage`
- **Files:** `antigravity/mod.rs` + tests, `FloatBar.tsx/.css/.test.tsx`, locales, `docs/PROVIDERS.md`
- **What changed:**
  - Process regex: `antigravity-cli(.exe)` allows `"` and path separators; bare `agy(.exe)` must end at whitespace, `"`, or EOS (not `C:\agy\other.exe`).
  - Float Bar: if error matches `/antigravity language server not running/i`, show compact overlay `FloatBarAgyRunNeeded` instead of `— / — / —`.
  - Error tooltip uses the raw provider error; recognized slots can still contribute detail when not in overlay mode.
- **Collision risk:** High with upstream Antigravity process detection **and** Float Bar error rendering.

### `acccc72e` — Personalize project identity and disable updater

- **Date:** 2026-08-19 11:15 +0900
- **Theme:** `identity-updater`
- **Files:** About tab, `App.tsx`, tray menu/bridge, `updater.rs` repo constant, `rust/Cargo.toml` repository URL, installer ISS/WiX, locales, privacy/signing/proof docs, deleted translated READMEs (`README.{es-MX,ja-JP,ko-KR,zh-CN,zh-TW}.md`), design spec
- **What changed:** See concept snapshot §3. Activation edges commented out, not deleted. About links to `junglesub` repo + GitHub Pages; credit line keeps `steipete/CodexBar`. Winget ID / `nesszer` upstream / historical ADRs left in place. Privacy no longer claims the running app hits GitHub Releases; installer disclosure is separate.
- **Collision risk:** **High.** Upstream About, tray update item, startup `checkForUpdates`, `GITHUB_REPO`, Cargo repository, and translated READMEs will all conflict. Re-enabling updates without a `personal-latest` design would point at the wrong product.

### `e1fad488` — Fix personal release probes

- **Date:** 2026-08-19 12:12 +0900
- **Theme:** `release-ci`
- **Files:** `personal-release.yml`, `docs/release/ci-cd.md`, tests
- **What changed:** Probe/publish robustness for the rolling personal release.
- **Collision risk:** Isolated to personal workflow.

### `8814387a` — Wait for personal release rename

- **Date:** 2026-08-19 12:28 +0900
- **Theme:** `release-ci`
- **Files:** same as above
- **What changed:** Publish path waits for GitHub’s rename of the rolling release so probes do not race.
- **Collision risk:** Isolated.

### `f6739330` — Update personal release in place

- **Date:** 2026-08-19 13:36 +0900
- **Theme:** `release-ci`
- **Files:** `personal-release.yml` (simplified), ci-cd docs, tests
- **What changed:** Rolling release is **updated in place** (replace assets / retarget) rather than delete+recreate. Fewer GitHub API race windows.
- **Collision risk:** Isolated. Do not merge upstream “create a versioned GitHub Release per tag” into this job without intending to change personal delivery.

### `3b9df0a0` — Fix PowerShell release JSON filtering

- **Date:** 2026-08-19 13:55 +0900
- **Theme:** `release-ci`
- **Files:** `personal-release.yml`, docs, tests
- **What changed:** PowerShell JSON/`Where-Object` filtering for release assets corrected (type-safe name matching).
- **Collision risk:** Isolated.

### `ba637a40` — Add floating bar background color and opacity settings

- **Date:** 2026-08-20 12:40 +0900
- **Theme:** `settings-ui`
- **Files:** `rust/src/settings.rs` + `raw.rs` + tests, `floatbar/mod.rs` patch, `commands/bridge.rs` + `settings.rs`, `SettingsSection.tsx` + tests, `FloatBar.tsx/.css`, `bridge.ts`, locales, `docs/CONFIGURATION.md`, ARCHITECTURE
- **What changed:** New persisted settings `float_bar_background_color` / `float_bar_background_opacity`. Color must be `#` + 6 hex digits or it becomes `#FFFFFF`. Opacity `0..=100` (0 allowed, unlike whole-bar opacity). CSS variables on the overlay; fill only (not text/icons). Settings UI: color picker, opacity slider, reset to `#FFFFFF` / `8`. Independent of `floatBarOpacity`.
- **Collision risk:** **High** on `Settings` / `RawSettings` / `SettingsSnapshot` / `SettingsUpdate` / Float Bar patch struct. Upstream adding nearby float-bar fields will cause schema merge conflicts. Concept: two opacities (window vs pill fill) must not be collapsed.

---

## Collision map for a future `main` ← upstream, then `personal` ← `main`

Read this table when reviewing an upstream/`main` diff. “Same files” means textual conflict is likely; “same concept” means even a clean merge can be wrong.

| Area | Personal commits | Likely overlapping `main` files | Concept to preserve on personal |
| --- | --- | --- | --- |
| Float Bar pill | `7d060749` … `6c2703bb`, `7d57b026`, `ba637a40` | `FloatBar.tsx`, `FloatBar.css`, `FloatBar.test.tsx`, `usageWindows.ts` (still used on `main` and other surfaces) | Three used-% slots + cadence-less fallback; ignore `showAsUsed` on this surface; per-metric color; append countdown; `modelSpecific` fallback-only |
| Float Bar settings | `94e6bb24`, `ba637a40` | `settings.rs`, `raw.rs`, `commands/settings.rs`, `floatbar/mod.rs`, `bridge.ts`, `SettingsSection.tsx` | `provider_metrics` notifies overlay; background color/opacity independent of window opacity |
| Antigravity fetch | `bc595aaa`, `bb7b4a78`, `7d57b026` | `rust/src/providers/antigravity/mod.rs` | Summary-first Gemini 5h/weekly mapping; legacy fallback; CLI regex; no `model_specific` from summary |
| Updater | `acccc72e` | `App.tsx`, `AboutTab.tsx`, `tray_menu.rs`, `tray_bridge.rs`, `updater.rs`, `system.rs` | Keep implementation, keep activation **off** until a personal-latest design exists |
| Identity / URLs | `acccc72e` | Cargo.toml, ISS/WiX, About, README*, PRIVACY | `junglesub` current; `nesszer` upstream-sync; `Finesssee` Winget; `steipete` credit |
| CI / release | `ca40b594` … `3b9df0a0`, `d2e164a3` | `.github/**`, `.circleci/**`, `docs/release/**`, `CONTEXT.md` | Keep `personal-release.yml`, `upstream-sync.yml`, `install-personal.ps1`. Decide whether to take upstream `pr-check.yml` (Blacksmith) or keep the slim personal one. Do not resurrect CircleCI as the personal publisher |
| Docs only | several README/spec commits | `README.md`, `ARCHITECTURE.md`, `PROVIDERS.md` | Personal README is fork-specific; architecture Float Bar paragraph is the three-window contract |

### Relatively independent (low product-logic risk)

- CodeRabbit (`.coderabbit.yaml`)
- `scripts/antigravity-doctor.ps1`
- Personal-release probe/rename/in-place publish iteration (`5b11cfcb`–`3b9df0a0`)
- Design specs under `docs/superpowers/` (unless you delete them in a merge)

### Surfaces **not** converted to three-window usage

Tray panel, pop-out, settings provider list, and CLI still follow shared/`main` usage-window helpers. A `main` change to `selectSingleMetricUsageWindow` affects those surfaces on personal too, but does **not** automatically change Float Bar. Do not “fix” Float Bar by restoring that helper unless you are intentionally reverting theme `float-bar-usage`.

---

## Suggested merge checklist

When `main` has new upstream commits:

1. Fast-forward `main` (this is what `upstream-sync.yml` already does with `--ff-only`).
2. Diff both branches against their merge base. The workflow lists every path changed by both branches in the sync PR as requiring a developer decision.
3. For each hit, decide **keep personal concept**, **take upstream concept**, or **re-implement personal concept on the new code**.
4. Highest-cost files if both sides touched them: `FloatBar.tsx`, `antigravity/mod.rs`, `settings.rs` / `raw.rs`, `App.tsx` / `AboutTab.tsx`, `.github/workflows/pr-check.yml`, `README.md`.
5. After merge, re-verify Float Bar slot classification (minutes bounds), Antigravity summary-then-fallback, updater still dormant, and background color settings still load.

The PR must use a normal merge commit. Do not squash or rebase it: preserving
`main` as an ancestor prevents later sync runs from reconsidering the same
upstream commits. Unresolved conflicts stay in Git's index and are never
committed as marker text; GitHub therefore blocks the PR until a developer
resolves and commits them.

This catalog does not include untracked local paths (for example `plugins/` at generation time).

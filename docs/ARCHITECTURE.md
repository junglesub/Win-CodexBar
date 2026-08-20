# Architecture overview (Windows)

Windows rewrite of upstream CodexBar architecture concepts for **Win-CodexBar**.
Upstream `docs/architecture.md` describes Swift modules (`CodexBarCore`, menu bar app, WidgetKit, Sparkle). Those do **not** apply here.

## Modules

| Area | Path | Role |
|------|------|------|
| Shared backend + CLI | `rust/` (`codexbar` crate) | Providers, settings, browser cookies, tray icon pixels, CLI |
| Desktop shell | `apps/desktop-tauri/src-tauri/` (`codexbar-desktop-tauri`) | Tauri 2 host: tray, windows, IPC commands, float bar, proof harness |
| Frontend | `apps/desktop-tauri/src/` | React 18 + Vite surfaces (tray panel, pop-out, settings, float bar) |

Cargo workspace (root `Cargo.toml`): members `rust`, `apps/desktop-tauri/src-tauri`; **default-member** is the Tauri crate. Shell depends on `codexbar = { path = "../../../rust" }`.

## Entry points

- **Desktop**: `apps/desktop-tauri/src-tauri/src/main.rs` — plugins, tray setup, float bar install, auto-refresh, command registration. Binary: `codexbar-desktop-tauri.exe`.
- **CLI**: `rust/src/main.rs` — subcommands only (no GUI on bare invoke). Binary: `codexbar.exe`.
- **Frontend bootstrap**: `apps/desktop-tauri/src/App.tsx` routes by window label (`main`, settings, floatbar, flyout).

## Data flow

1. **Provider refresh**  
   `instantiate_provider` (`rust/src/core/provider_factory.rs`) → `Provider::fetch_usage` → shell `commands/providers.rs` (semaphore + timeout) → `AppState.provider_cache` → events → React `useProviders`.

2. **Settings**  
   `%AppData%\Roaming\CodexBar\settings.json` (and sibling stores) via `Settings::load` / `save` + `secure_file` (DPAPI-capable). UI patches go through `updateSettings` → save → settings / float-bar events.

3. **Tray**  
   `tray_bridge` + `tray_menu`. Icon RGBA from shared `codexbar::tray::{render_bar_icon_rgba, render_percent_icon_rgba}`.

4. **Float bar**  
   Detached always-on-top window owned by `floatbar/`. Builder must pin `.theme(Some(tauri::Theme::Dark))` so WebView2’s shared profile does not flip other windows under theme `auto`.
   The provider pill reads canonical `primary`, `secondary`, and `tertiary` rate windows and renders fixed 5-hour / weekly / monthly positions. Values are consumed percentages; missing or informational windows render as `—`. When inline resets are enabled, a slot with a valid future reset appends a compact countdown using only its largest unit (`m`, `h`, or `d`) beside the percentage. The hover tooltip and accessible name append a localized relative last-updated line (from `ProviderUsageSnapshot.updatedAt`, advanced by a single shared 30-second clock). Each displayed metric colors itself from its own percentage while the pill stays neutral; sorting follows the highest recognized usage value. Cost and extra rate windows remain separate from these quota positions; `modelSpecific` is used only as the single cadence-less fallback metric (when no canonical window has a recognized cadence). The pill/cost/empty background color and opacity arrive from Settings as CSS variables (`--floatbar-background-color`, `--floatbar-background-opacity`), so they apply to both Floating and Taskbar styles. A settings patch is saved and broadcast as the existing `float-bar-config-changed` live event, so an already-open Float Bar updates its background without recreating its window; whole-bar `float_bar_opacity` and the pill-surface background opacity remain independent.

5. **CLI**  
   Same provider factory and settings stores as the app. Useful for scripts without UI (`usage`, `cost`, `guard`, `serve`, `config`, …).

## Surfaces (desktop)

- **Tray panel** — left-click tray; blur-dismiss (suppressed in proof mode).
- **Pop-out / flyout** — larger dashboard window.
- **Settings** — detached window; tabs: `general`, `providers`, `notifications`, `menuBar`, `menu`, `usageSpend`, `advanced`, `about`.
- **Float bar** — optional capacity strip.

## Concurrency & platform

- Rust edition 2024; async via Tokio in CLI and shell.
- Provider fetches are concurrent with a semaphore cap in the shell.
- Windows-specific: DPAPI cookie decrypt, DWM dark caption, tray promotion, start-at-login (`HKCU\...\Run`), WebView2.
- Prefer validating tray/DPAPI/cookies on **native Windows**; WSL is insufficient for DPAPI.

## Related docs

- [BUILDING.md](./BUILDING.md) — build / test / release
- [CLI.md](./CLI.md) — command-line surface
- [CONFIGURATION.md](./CONFIGURATION.md) — settings paths and stores
- [PROVIDERS.md](./PROVIDERS.md) — provider factory and sources
- [COOKIES.md](./COOKIES.md) — browser cookie import
- Root [AGENTS.md](../AGENTS.md) — agent-oriented guidelines

Upstream-only (macOS): WidgetKit, Sparkle, Keychain Safe Storage prompts, `Scripts/package_app.sh` — not used in this port.

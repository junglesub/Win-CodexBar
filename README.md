# Win-CodexBar — Personal Float Bar Fork

A Windows floating bar and system tray monitor for 56+ AI coding assistant quotas.

[Website](https://junglesub.github.io/Win-CodexBar/) ·
[Personal release](https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest) ·
[Repository](https://github.com/junglesub/Win-CodexBar) ·
[Windows upstream](https://github.com/nesszer/Win-CodexBar) ·
[Original macOS project](https://github.com/steipete/CodexBar)

![Win-CodexBar Float Bar overlay](https://github.com/user-attachments/assets/a9be3368-0a19-4890-93f9-064e80e81237)

## What's different

This branch focuses on a compact Float Bar that shows **used quota** in a fixed
order:

```text
5h / weekly / monthly
23% / 41% / 8%
```

| Slot | Window |
|---|---:|
| 5h | exactly 300 minutes |
| weekly | 10,080–40,319 minutes |
| monthly | 40,320–44,640 minutes |

- Missing windows show `—`; providers without classified windows use one
  available fallback metric.
- Each value is colored independently: warning at 75%, critical at 90%.
- Optional reset countdowns append the largest remaining time unit
  (`100% 4d`).
- Optional exhausted display hides the percent and shows only the remaining
  time (`100% 4d` → `4d 12h`, `100% 3h` → `3h 12m`). Toggle in Settings →
  Menu → Floating Bar ("Hide Percent When Exhausted",
  `float_bar_hide_percent_when_exhausted`).
- Optional clock style shows that reset time as `M/D HH:MM` instead of a
  countdown — `HH:MM` only when the reset falls on the same day
  ("Show Reset as Clock Time", `float_bar_exhausted_clock_time`).
- Optional weekday style replaces the date with `Mon`, `Tue`, … while the
  reset falls within the coming week; beyond that the date is kept
  ("Show Weekday Instead of Date", `float_bar_exhausted_weekday_time`).
- Optional battery style renders selected Float Bar usage slots as battery cells
  (outline + fill + nub) instead of percentage numbers. Toggle in Settings →
  Menu → Floating Bar ("Battery style", `float_bar_battery_style`), then choose
  5h, weekly, monthly, or fallback slots with `float_bar_battery_slots`.
  An empty slot list keeps battery cells enabled for all slots; percentages
  remain available on hover, and exhausted or error slots keep their existing
  display. Battery cells always show remaining quota, while the companion
  "Show remaining" toggle (`float_bar_show_remaining`) only flips percentage
  text and its accessible detail.
- Antigravity uses Gemini quota summary data for 5h and weekly usage, with a
  model-specific fallback when unavailable.

## Install or update

Recommended: run this in Windows PowerShell. It downloads the rolling Setup
release, verifies its SHA-256 checksum, and installs or updates CodexBar for the
current user.

```powershell
irm https://raw.githubusercontent.com/junglesub/Win-CodexBar/personal/scripts/install-personal.ps1 | iex
```

For manual installation, download either `CodexBar-*-Setup.exe` or the portable
`.exe` from the [personal release](https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest).
Setup includes the desktop app, CLI, and runtime bootstrappers. Portable is one
desktop executable and expects WebView2 and the VC++ runtime to already exist.

## Run

After Setup, open **CodexBar** from the Start menu, or run:

```powershell
& "$env:LOCALAPPDATA\Programs\CodexBar\codexbar.exe" menubar
```

For Portable, run the downloaded `.exe` directly. CodexBar starts in the system
tray. Open **Settings → Menu** and enable **Float Bar**.

## Development

Use Windows 10/11 x64 with Git, Node.js 20, Rust stable MSVC, Visual Studio Build
Tools (**Desktop development with C++**), and WebView2 Runtime.

```powershell
git clone --branch personal https://github.com/junglesub/Win-CodexBar.git
cd Win-CodexBar

nvm install 20
nvm use 20
corepack enable
corepack prepare pnpm@10.18.1 --activate

rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
pnpm --dir apps/desktop-tauri install --frozen-lockfile
```

Build and run the desktop app:

```powershell
.\scripts\dev.ps1
```

Run the existing debug build without rebuilding:

```powershell
.\scripts\dev.ps1 -SkipBuild
```

For frontend hot reload:

```powershell
pnpm --dir apps/desktop-tauri run tauri:dev
```

## More

For providers, authentication, configuration, CLI usage, building, and full
documentation, see [junglesub/Win-CodexBar](https://github.com/junglesub/Win-CodexBar).
This fork builds on the Windows port by [nesszer/Win-CodexBar](https://github.com/nesszer/Win-CodexBar),
originally created for macOS by [steipete/CodexBar](https://github.com/steipete/CodexBar).

GitHub Actions release builds check the rolling
[personal release](https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest)
and can download and install a newer build. Local development builds skip update checks.

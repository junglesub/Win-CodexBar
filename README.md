# Win-CodexBar — Personal Float Bar Fork

<<<<<<< HEAD
A Windows floating bar and system tray monitor for 56+ AI coding assistant quotas.
=======
[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文（臺灣）](./README.zh-TW.md) | [日本語](./README.ja-JP.md) | [한국어](./README.ko-KR.md) | [Español mexicano](./README.es-MX.md) | [Türkçe](./README.tr-TR.md)
>>>>>>> upstream/main

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
- Optional reset countdowns show the largest remaining time unit.
- Antigravity uses Gemini quota summary data for 5h and weekly usage, with a
  model-specific fallback when unavailable.

## Install or update

<<<<<<< HEAD
Recommended: run this in Windows PowerShell. It downloads the rolling Setup
release, verifies its SHA-256 checksum, and installs or updates CodexBar for the
current user.
=======
## Code signing

> **Code signing:** Free signing via SignPath.io (certificate: SignPath Foundation) is **planned, pending onboarding — not yet wired into the release pipeline**. See [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md) for the signing policy.
> Windows release installers are currently unsigned, which may cause an incorrect SmartScreen/Defender alert — verify the SHA-256 published alongside each release; see [docs/PRIVACY.md](docs/PRIVACY.md) for data handling.

## First Run

1. Launch **CodexBar** from the Start Menu or portable executable.
2. Click the tray icon to open the usage panel.
3. Open **Settings -> Providers**.
4. Enable the providers you use.
5. Add the matching credential type: OAuth/device login, API key, browser cookies, local CLI login, or token account.

For Claude, browser cookies/sessionKey are preferred because they match Claude's settings-page usage. OAuth and CLI stay available as fallbacks. For CLI-based providers such as Codex and Gemini, sign in with the provider CLI first.

## Latest Release

**v0.33.2** fixes tray-panel dismissal so the popover closes on focus loss or Escape, without immediately reopening from the same tray click.

See the full history in [CHANGELOG.md](CHANGELOG.md).

## Supported Providers

<details>
<summary>Provider matrix</summary>

| Provider | Auth | Tracks |
|---|---|---|
| Codex | OAuth / CLI | Session, Weekly, Credits |
| Claude | Cookies / OAuth fallback / CLI fallback | Session (5h), Weekly |
| Cursor | Cookies | Plan, Usage, Billing |
| Factory | Cookies | Usage |
| Gemini | gcloud OAuth | Quota |
| Copilot | GitHub Device Flow / gh CLI / legacy token | Plan usage, Chat |
| Antigravity | Local LSP | Usage, Per-model quotas |
| z.ai | API Token | Quota |
| MiniMax | API / Cookies | Usage, Billing Summary |
| Kiro | Cookies / CLI | Monthly Credits, Overage |
| Vertex AI | gcloud OAuth | Cost |
| Augment | Cookies | Credits |
| OpenCode | Local Config | Usage |
| Kimi | Cookies | 5h Rate, Weekly |
| Kimi K2 | API Key | Credits |
| Amp | Cookies | Usage |
| Warp | Local Config | Usage |
| Ollama | Cookies / API Key | Usage, Cloud Models, Pace windows |
| Azure OpenAI | API Key | Deployment |
| T3 Chat | Cookies / cURL | Base, Overage |
| OpenRouter | API Key | Credits |
| JetBrains AI | Local Config | Usage |
| Alibaba | Cookies | Usage |
| Alibaba Token Plan | Cookies | Token Plan Credits, Reset date |
| NanoGPT | API Key | Credits |
| Infini | API Key | Session, Weekly, Quota |
| Perplexity | Cookies | Credits, Plan |
| Abacus AI | Cookies | Credits |
| Mistral | Cookies | Billing, Usage |
| OpenCode Go | Cookies | Usage, Zen Balance |
| Kilo | API Key / CLI | Usage |
| Codebuff | API Key / Local Config | Credits, Weekly |
| DeepSeek | API Key | Balance, Usage summaries, Cost |
| Windsurf | Local Cache | Daily, Weekly |
| Manus | Cookies | Credits, Refresh Credits |
| Xiaomi MiMo | Cookies | Balance, Token Plan |
| Doubao | API Key | Request Limits |
| Command Code | Cookies | Monthly Credits, Purchased Credits |
| Crof | API Key | Credits, Request Quota |
| StepFun | Oasis Token | 5h, Weekly, Token refresh |
| Venice | API Key | USD / DIEM Balance |
| OpenAI | Admin API / API Key | Usage, Requests, Project-scoped cost, Credit Balance |
| Grok | Cookies / auth.json | Billing |
| ElevenLabs | API Key | Subscription Credits, Voice Slots |
| Deepgram | API Key | Project Usage |
| Groq | API Key | Enterprise Metrics |
| LLM Proxy | API Key | Quota Stats |

</details>

## Supported Languages

The UI and contributor reporting currently support:

- English
- 简体中文
- 繁體中文（臺灣）
- 日本語
- 한국어
- Español mexicano
- Türkçe

## Build From Source
>>>>>>> upstream/main

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

The in-app updater is temporarily disabled; install the latest build from the
[personal release](https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest)
instead.

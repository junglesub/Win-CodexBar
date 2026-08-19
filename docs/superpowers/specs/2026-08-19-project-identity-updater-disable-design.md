# Project identity cleanup and updater disable design

## Goal

Make `junglesub/Win-CodexBar` the clear current project identity across the
desktop app, package metadata, and current documentation while preserving the
credits and historical references that explain how the project evolved.

Use these canonical URLs:

- Repository: `https://github.com/junglesub/Win-CodexBar`
- Website: `https://junglesub.github.io/Win-CodexBar/`

Temporarily disable the in-app updater. GitHub Actions may continue publishing
the rolling `personal-latest` release, but connecting that release to the app
updater is a separate future change.

## Current state

The About tab still presents `Finesssee/Win-CodexBar`, `codexbar.app`, and a
NessZerra-centered copyright line. Other active metadata and documentation use
a mixture of `Finesssee/Win-CodexBar` and `nesszer/Win-CodexBar`.

The updater is reachable from several independent activation points:

- a delayed startup check in the React application;
- update controls in the About tab;
- the tray menu's **Check for Updates** action;
- update banners in the tray and pop-out surfaces;
- install-on-quit handling after a downloaded update becomes ready.

The Rust updater implementation, Tauri commands, settings fields, frontend
bridge types, and update-state hook already form a reusable implementation.
Deleting or redesigning them would make the planned personal-release
integration unnecessarily expensive.

## Project identity and credit policy

Current product surfaces must identify the maintained fork first. The About
tab must link `junglesub/Win-CodexBar` to the canonical repository and link the
Website action to the GitHub Pages site.

The About footer must retain a linked credit to `steipete/CodexBar` as the
original project. Its copy should distinguish the current fork from its source,
for example: `junglesub/CodexBar. Based on steipete/CodexBar. MIT License.`
Existing localized About strings should express the same relationship where
those strings are defined; locales that intentionally fall back to English do
not require new translation infrastructure.

References are classified by purpose:

- Replace current repository, release, clone, support, publisher, and website
  links with the canonical `junglesub` URLs.
- Keep `Finesssee.Win-CodexBar` wherever it is the immutable Winget package ID
  or part of its approved manifest path.
- Keep `nesszer/Win-CodexBar` where it is the actual upstream-sync source.
- Keep `steipete/CodexBar` in About credit, `PORTING.md`, source provenance
  comments, and other material that explains the original implementation.
- Keep old owners and URLs in historical changelog entries and ADR decisions
  when changing them would rewrite history.
- Do not modify local Git remote names or URLs; this design applies only to
  tracked project content.

## Updater behavior

Disable only the updater's activation edges and preserve its implementation.
This is the smallest reversible change and keeps future release integration
local to the existing update flow.

The disabled behavior is:

1. Do not perform the delayed startup update check or automatic download.
2. Do not render About update controls, channel selection, status, download,
   or install actions.
3. Do not add **Check for Updates** to the tray menu or resolve that menu ID to
   an action.
4. Do not apply a ready update during application quit.
5. Do not surface update banners while the updater is disabled.

Activation code should be commented at the smallest practical boundaries with
a short explanation that in-app updates are disabled until `personal-latest`
release integration is designed. Large obsolete JSX or implementation blocks
must not be duplicated in comments solely for possible future reuse; Git
history already preserves them.

The following remain intact:

- `rust/src/updater.rs` download, verification, selection, and apply logic;
- Tauri updater commands and command registration;
- update state stored in `AppState`;
- settings JSON fields such as update channel, auto-download, and
  install-on-quit;
- Rust/TypeScript bridge DTOs and invoke functions.

Dormant updater repository constants and test URLs should identify
`junglesub/Win-CodexBar`, but changing them must not reactivate a network call.
No runtime feature flag or new configuration option is needed.

## Metadata and documentation

Update active project information in the smallest existing sources of truth:

- About links and their focused frontend test;
- Cargo repository metadata and Windows installer support/publisher links;
- release-builder defaults and their normalization tests;
- current README files, clone instructions, privacy/support documentation, and
  other present-tense references to the maintained repository.

For installer metadata, use the GitHub Pages site as the publisher/help URL,
the GitHub Issues page as support, and comment out `AppUpdatesURL` while the
in-app updater is disabled.

Update `CONTEXT.md` to record the intentional split between delivery and
application behavior: the personal workflow continues replacing the
`personal-latest` prerelease, while installed apps do not query or consume it.
Re-enabling updates requires a separate design covering release-channel
selection, prerelease semantics, asset selection, and rollout.

Update `docs/PRIVACY.md` so it no longer claims the disabled application makes
GitHub Releases API requests. It should separately disclose that the optional
PowerShell installer contacts GitHub only when a user explicitly runs it.
Current QA and user documents that describe updater UI must mark the feature as
temporarily disabled rather than instructing users to test or use it.

## Interfaces and compatibility

There are no public API, command signature, DTO, or settings-schema changes.
Existing settings files containing update preferences remain valid, but those
preferences have no effect while updater activation is disabled.

No dependencies, build tooling, abstraction layers, or migration logic are
introduced. Existing release automation and the manual personal installer are
not disabled by this work.

## Test contract

Focused automated checks must cover:

- About opens the canonical repository and website URLs and retains the
  original-project credit link;
- About does not render updater controls;
- advancing the startup timer does not invoke update check or download bridge
  functions;
- the tray menu does not contain or resolve `check_for_updates`;
- repository-wide stale-reference searches leave old identities only in the
  explicitly preserved Winget, upstream-sync, provenance, changelog, and ADR
  locations.

Run only the affected Vitest and Rust unit tests. Per repository instructions,
do not run a production or debug build unless the user separately requests it.
Because UI proof requires a fresh desktop build, CUA validation is deferred and
must be reported as not run rather than performed against a stale executable.

## Acceptance criteria

- About presents `junglesub/CodexBar` as the maintained fork display label and links the
  canonical repository and website.
- Original CodexBar authorship and meaningful development provenance remain
  visible and historically accurate.
- Starting, opening, using, or quitting the app cannot initiate the existing
  updater flow through a normal user surface.
- GitHub Actions and the manual `personal-latest` installer continue to work
  independently of the disabled in-app updater.
- Active package and documentation links no longer send users to a former fork
  owner, except where that identifier is operationally or historically
  required.
- The implementation remains a reversible edge disable, not an updater rewrite
  or deletion.

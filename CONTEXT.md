# Personal fork CI and release context

The `personal` branch uses `.github/workflows/personal-release.yml` as its only
hosted delivery pipeline. Every push builds the Windows installer and portable
app, then replaces the mutable `personal-latest` GitHub prerelease.

The workflow uses GitHub-hosted `windows-2025`, so it consumes this fork's
GitHub Actions allowance. Runs are serialized and restore Cargo, pnpm, and
installer dependency caches to avoid rebuilding or downloading more than
necessary.

`CI_BUDGET_MODE` does not gate the personal release workflow. Disable the
workflow in GitHub Actions or remove its push trigger if automatic builds need
to be paused.

Canonical `vX.Y.Z` releases and Winget updates are separate. Never point
Winget at `personal-latest`, because the tag and assets are replaced on every
successful personal build.

## Delivery vs. application behavior (updater disabled)

Delivery and the app's update behavior are intentionally split while the
in-app updater is disabled:

- The personal workflow continues to build and publish the rolling
  `personal-latest` prerelease, and the manual
  `scripts/install-personal.ps1` installer continues to fetch and install it.
- Installed apps do **not** query or consume `personal-latest`: the startup
  update check / auto-download, About updater controls, tray
  **Check for Updates**, update banners, and install-on-quit are all
  deactivated. The updater implementation, Tauri commands, settings fields,
  and bridge types remain dormant.

Re-enabling in-app updates requires a separate design covering
release-channel selection, prerelease semantics, asset selection, and
rollout. Do not re-activate the updater activation edges as part of a release
or packaging change.

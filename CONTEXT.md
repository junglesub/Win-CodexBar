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

## Rolling delivery and application updates

Release builds embed their source commit SHA and use the in-app updater to
compare it with the commit referenced by the mutable `personal-latest` tag.
Local development builds without an embedded SHA skip this network check.

- The personal workflow publishes the installer and portable app under
  `personal-latest`; `scripts/install-personal.ps1` remains the manual install
  path.
- Release builds check for a different `personal-latest` commit after startup.
  About and the tray menu also expose manual checks, while tray/pop-out banners
  surface an available update.
- Auto-download and install-on-quit remain controlled by their existing user
  settings. Installer downloads continue to require the published SHA-256
  digest before automatic application.

Canonical `vX.Y.Z` releases remain independent of this rolling personal update
channel.

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

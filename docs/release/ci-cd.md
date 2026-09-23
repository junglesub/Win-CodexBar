# Personal branch release delivery

## Automated release

`.github/workflows/personal-release.yml` runs on every push to `personal` and
can also be started manually from that branch. The workflow runs on GitHub's
hosted Windows 2025 image. Its build job has `contents: read`; only the
separate publish job has `contents: write`.

The build job checks out the triggering commit without persisting credentials,
restores Cargo, pnpm, and installer dependency caches, then calls the existing
`scripts/windows-release-build.ps1` with the immutable `GITHUB_SHA`. The four
outputs cross into the publish job through a one-day workflow artifact:

- `CodexBar-X.Y.Z-Setup.exe`
- `CodexBar-X.Y.Z-Setup.exe.sha256`
- `CodexBar-X.Y.Z-portable.exe`
- `CodexBar-X.Y.Z-portable.exe.sha256`

After all four assets exist, the publish job verifies that `GITHUB_SHA` is
still the head of `personal`. The workflow artifact is the staging layer. On
the first run the publisher creates `personal-latest`; later runs replace its
assets in place, remove assets from older versions, and verify the exact
four-file set. It then updates the title and notes and moves the Git tag to the
new commit. Runs are serialized, and stale reruns skip publication.

The rolling prerelease is intentionally separate from canonical `vX.Y.Z`
releases and Winget. Do not use `personal-latest` as a Winget source because
its assets and tag are mutable.

The Windows publisher parses `gh` JSON with PowerShell's `ConvertFrom-Json`.
Keep quoted string filters out of `gh --jq` arguments: Windows PowerShell can
strip those quotes before `gh` receives them. Assign parsed JSON arrays before
filtering them because Windows PowerShell 5.1 does not enumerate an array
emitted directly by `ConvertFrom-Json` in this pipeline shape.

## Repository settings

GitHub Actions must be allowed to create releases with `GITHUB_TOKEN`. In
**Settings → Actions → General → Workflow permissions**, select
**Read and write permissions**. No personal access token or repository secret
is required.

The workflow only publishes when its ref is `refs/heads/personal`; selecting a
different branch for `workflow_dispatch` safely skips the job.

Run the dependency-free release checks locally with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\release-pipeline.tests.ps1
```

## Retry behavior

Rerunning the current workflow rebuilds the same commit and repairs the rolling
prerelease idempotently. A stale rerun does not publish. A failed build leaves
the previous release untouched because publication begins only after all assets
are present. GitHub does not provide an atomic whole-release asset swap, so an
upload failure can leave a partially updated asset set; rerun the workflow to
replace and verify all four files.

For a local installer build, use:

```powershell
$commit = git rev-parse HEAD
./scripts/windows-release-build.ps1 -Ref $commit -RepoUrl (git rev-parse --show-toplevel)
```

The automated personal build does not run installer smoke tests. Use
`-SmokeInstall` locally before promoting a commit to a canonical release.

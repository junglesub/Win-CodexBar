# Personal release PowerShell installer design

## Goal

Allow a Windows user to install or update the rolling `personal-latest`
prerelease with one command:

```powershell
irm https://raw.githubusercontent.com/junglesub/Win-CodexBar/personal/scripts/install-personal.ps1 | iex
```

The command installs the existing `CodexBar-*-Setup.exe` release asset. Running
it again performs an in-place update through the installer's stable `AppId` and
`UsePreviousAppDir` behavior.

## Scope

- Add `scripts/install-personal.ps1` as a PowerShell 5.1-compatible bootstrap.
- Add one focused PowerShell test script for asset selection and checksum
  validation.
- Document the one-line command only in the root `README.md`, immediately after
  its existing `personal-latest` release documentation. Do not update translated
  README files because they are not maintained in this branch.
- Keep the canonical release, Winget, portable executable, release workflow,
  and in-app updater unchanged.

The bootstrap script remains in the repository rather than becoming a fifth
release asset. This keeps the existing four-asset release contract unchanged
and gives the command a stable URL.

## Installer flow

1. Require Windows and use `$ErrorActionPreference = 'Stop'`.
2. Query GitHub's release-by-tag API for
   `junglesub/Win-CodexBar` / `personal-latest` with a user-agent header.
3. Require exactly one asset matching `CodexBar-*-Setup.exe` and the checksum
   asset whose name is exactly `<installer name>.sha256`. Reject missing or
   ambiguous assets.
4. Create a unique temporary directory, download both assets from their
   `browser_download_url` values, and clean the directory in `finally`.
5. Parse the existing checksum format, `<64 lowercase hex>  <filename>`. Reject
   malformed content or a filename that does not equal the selected installer.
6. Compare the expected hash with `Get-FileHash -Algorithm SHA256` using a
   case-insensitive comparison. Stop before execution on mismatch.
7. Run the Inno Setup installer with `/VERYSILENT`, `/SUPPRESSMSGBOXES`, and
   `/NORESTART`, wait for completion, and accept exit codes `0` and `3010`.
   Existing installer behavior closes and relaunches CodexBar during a silent
   upgrade.

## Error handling and trust boundary

Every failure must terminate with a concise message and a non-success result:
GitHub API failure, missing or duplicate assets, download failure, malformed
checksum, hash mismatch, process-launch failure, or installer failure.

The checksum protects against a mismatched or corrupted download, but both the
script and checksum come from this mutable personal repository. The `irm | iex`
command is therefore a convenience path for users who trust this repository,
not a replacement for Authenticode or a version-pinned stable release.

## Test contract

The production script exposes small pure helpers and does not perform an
installation when dot-sourced by tests. A dependency-free PowerShell test must
cover:

- selecting the one Setup asset and its exact checksum sidecar;
- rejecting missing or duplicate Setup assets;
- accepting the release builder's checksum format;
- rejecting a checksum filename mismatch, malformed checksum, and hash
  mismatch.

The test runs locally with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-personal.tests.ps1
```

The existing focused release pipeline test must also remain green.

## Acceptance criteria

- The documented command works in Windows PowerShell 5.1 without `gh`, Git, or
  an additional package manager.
- A fresh installation and an existing installation both use the same Setup
  executable path.
- No installer starts until its downloaded checksum is validated.
- Temporary downloads are removed after success or failure.
- No GitHub release or branch is pushed or published as part of development.

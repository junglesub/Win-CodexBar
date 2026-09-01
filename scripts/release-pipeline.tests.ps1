#Requires -Version 5.1
<##
Focused, dependency-free checks for the pure release pipeline helpers.
Run with: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\release-pipeline.tests.ps1
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptRoot 'release-pipeline-common.ps1')

function Assert-True {
    param([Parameter(Mandatory)][bool]$Condition, [Parameter(Mandatory)][string]$Message)
    if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Assert-Equal {
    param([Parameter(Mandatory)]$Actual, [Parameter(Mandatory)]$Expected, [Parameter(Mandatory)][string]$Message)
    if ($Actual -ne $Expected) { throw "Assertion failed: $Message (actual '$Actual', expected '$Expected')" }
}

function Assert-Throws {
    param([Parameter(Mandatory)][scriptblock]$Block, [Parameter(Mandatory)][string]$Message)
    $thrown = $false
    try { & $Block } catch { $thrown = $true }
    Assert-True $thrown $Message
}
Assert-Equal (Get-NodeMajor 'v24.18.0') 24 'Node 24 major parsing'
Assert-Equal (Assert-NodeMajor 'v24.18.0' 24) 24 'Node 24 requirement'
Assert-Throws { Assert-NodeMajor 'v23.11.0' 24 } 'non-24 Node major rejected by release prerequisite'

$jsonArray = '[{"tagName":"personal-staging"},{"tagName":"personal-latest"}]'
$parsedArray = $jsonArray | ConvertFrom-Json
Assert-True (@($parsedArray | Where-Object tagName -EQ 'personal-latest').Count -eq 1) 'PowerShell 5.1 enumerates an assigned JSON array'

$prerequisiteText = Get-Content -Raw -LiteralPath (Join-Path $scriptRoot 'install-release-prerequisites.ps1')
Assert-True ($prerequisiteText -match '\$requiredNodeMajor\s*=\s*24') 'release prerequisite pins Node major 24'
Assert-True ($prerequisiteText -match '10\\.18\\.1') 'release prerequisite keeps pnpm 10.18.1 pinned'

Assert-Equal (Normalize-GitHubRepository 'https://github.com/junglesub/Win-CodexBar.git') 'junglesub/win-codexbar' 'HTTPS canonical URL'
Assert-Equal (Normalize-GitHubRepository 'git@github.com:junglesub/Win-CodexBar.git') 'junglesub/win-codexbar' 'SSH canonical URL'
Assert-True (Test-CanonicalReleaseTag 'v1.2.3') 'canonical release tag accepted'
Assert-True (-not (Test-CanonicalReleaseTag 'v1.2.3-rc.1')) 'prerelease tag rejected'
Assert-True (-not (Test-CanonicalReleaseTag 'v01.2.3')) 'leading-zero tag rejected'
Assert-Equal (Get-ReleaseVersionFromTag 'v0.48.0') '0.48.0' 'version extraction'
Assert-Throws { Get-ReleaseVersionFromTag 'v0.48.0+build' } 'invalid version extraction fails'

$assetNames = Get-RequiredReleaseAssets '0.48.0'
Assert-Equal $assetNames.Count 6 'exactly six release asset names including sidecars'
Assert-Equal $assetNames[0] 'CodexBar-0.48.0-Setup.exe' 'installer name'
Assert-Equal $assetNames[3] 'CodexBar-0.48.0-portable.exe.sha256' 'portable sidecar name'
Assert-Equal $assetNames[4] 'CodexBarCLI-v0.48.0-windows-x64.zip' 'CLI archive name'
Assert-Equal $assetNames[5] 'CodexBarCLI-v0.48.0-windows-x64.zip.sha256' 'CLI sidecar name'

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('win-codexbar-release-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
try {
    $asset = Join-Path $testRoot 'CodexBar-0.48.0-Setup.exe'
    [IO.File]::WriteAllText($asset, 'deterministic fixture')
    $hash = Get-AssetSha256 $asset
    [IO.File]::WriteAllText("$asset.sha256", "$hash  $(Split-Path $asset -Leaf)`n")
    Assert-Equal (Get-SidecarSha256 $asset) $hash 'sidecar parser'
    Assert-AssetMatchesSidecar $asset
    [IO.File]::WriteAllText("$asset.sha256", ('0' * 64) + "  bad`n")
    Assert-Throws { Assert-AssetMatchesSidecar $asset } 'sidecar mismatch fails'
} finally {
    if ([IO.Directory]::Exists($testRoot)) { [IO.Directory]::Delete($testRoot, $true) }
}

$builderText = Get-Content -Raw -LiteralPath (Join-Path $scriptRoot 'windows-release-build.ps1')
$legacySwitch = 'Upload' + 'Release'
Assert-True ($builderText -notmatch $legacySwitch) 'legacy upload parameter removed'

$workflowPath = Join-Path (Split-Path -Parent $scriptRoot) '.github\workflows\personal-release.yml'
$workflowText = Get-Content -Raw -LiteralPath $workflowPath
Assert-True ($workflowText -match 'branches:\s*\[personal\]') 'personal pushes trigger release'
Assert-True ($workflowText -match 'permissions:\s*\r?\n\s+contents:\s*read') 'build defaults to read-only contents'
Assert-True ($workflowText -match 'publish:[\s\S]+permissions:\s*\r?\n\s+contents:\s*write') 'only publish job can write releases'
Assert-True ($workflowText -match 'GH_REPO:\s*\$\{\{ github\.repository \}\}') 'checkout-free publisher identifies its repository'
Assert-True ($workflowText -match 'gh release list --limit 100 --json tagName') 'rolling release existence uses a non-failing list query'
Assert-True ($workflowText -match 'git/matching-refs/tags/personal-latest') 'rolling tag existence uses a non-failing refs query'
Assert-True ($workflowText -match "Where-Object tagName -EQ 'personal-latest'") 'release probe filters with PowerShell'
Assert-True ($workflowText -match "Where-Object ref -EQ 'refs/tags/personal-latest'") 'tag probes select the exact ref with PowerShell'
Assert-True ($workflowText -match '\$previousReleases\s*=\s*\$previousReleasesJson\s*\|\s*ConvertFrom-Json') 'release JSON is assigned before filtering'
Assert-True ($workflowText -match '\$previousTagRefs\s*=\s*\$previousTagRefsJson\s*\|\s*ConvertFrom-Json') 'tag JSON is assigned before filtering'
Assert-True ($workflowText -match '\$observedTagRefs\s*=\s*\$observedTagRefsJson\s*\|\s*ConvertFrom-Json') 'tag verification JSON is assigned before filtering'
Assert-True ($workflowText -notmatch '--jq\s+''[^'']*"personal-latest"') 'native gh arguments do not contain PowerShell-stripped jq quotes'
Assert-True ($workflowText -notmatch 'git/ref/tags/personal-latest') 'publisher does not probe a missing tag with a failing command'
Assert-True ($workflowText -match "github\.ref == 'refs/heads/personal'") 'manual runs are restricted to personal'
Assert-True ($workflowText -match 'persist-credentials:\s*false') 'build checkout does not retain write credentials'
Assert-True ($workflowText -match 'windows-release-build\.ps1') 'workflow reuses Windows release builder'
Assert-True ($workflowText -match 'Expected four release assets') 'workflow checks the complete asset set'
Assert-True ($workflowText -match 'actions/upload-artifact@v4') 'build passes assets without a write token'
Assert-True ($workflowText -notmatch 'personal-staging-') 'workflow artifact is the only staging layer'
Assert-True ($workflowText -notmatch 'personal-backup-') 'publisher does not swap release tag names'
Assert-True ($workflowText -match 'release upload personal-latest @assets --clobber') 'publisher updates the rolling release in place'
Assert-True ($workflowText -match 'release delete-asset personal-latest') 'publisher removes superseded version assets'
Assert-True ($workflowText -match 'Compare-Object \$assetNames \$publishedNames') 'publisher verifies the exact asset set'
Assert-True ($workflowText -match 'observedTagSha') 'ambiguous tag updates are verified'
Assert-True ($workflowText -match 'git/ref/heads/personal') 'workflow rejects stale builds before publication'
Assert-True ($workflowText -notmatch 'release delete personal-latest') 'workflow keeps the previous release during replacement'
Assert-True ($workflowText -match '--prerelease') 'personal release cannot become canonical latest'
Assert-True (-not (Test-Path (Join-Path (Split-Path -Parent $scriptRoot) '.circleci\config.yml'))) 'CircleCI config removed'
foreach ($removedScript in @('circleci-release-build.ps1', 'emit-release-manifest.ps1', 'publish-github-release.ps1', 'release-preflight.ps1')) {
    Assert-True (-not (Test-Path (Join-Path $scriptRoot $removedScript))) "$removedScript removed"
}

$upstreamSyncText = Get-Content -Raw -LiteralPath (Join-Path (Split-Path -Parent $scriptRoot) '.github\workflows\upstream-sync.yml')
Assert-True ($upstreamSyncText -match 'git merge --ff-only upstream/main') 'fork main fast-forwards from upstream'
Assert-True ($upstreamSyncText -match 'git checkout -B sync/upstream main') 'new sync branches track fork main'
Assert-True ($upstreamSyncText -match 'git merge --no-edit main') 'existing sync branches merge later main commits normally'
Assert-True ($upstreamSyncText -match 'comm -12') 'paths changed by both personal and main require developer review'
Assert-True ($upstreamSyncText -notmatch 'git merge --squash') 'sync never squashes main into personal'
Assert-True ($upstreamSyncText -notmatch 'git add -A') 'sync never commits unresolved conflict markers'
Assert-True ($upstreamSyncText -notmatch 'checkout origin/personal -- \.github/workflows') 'main workflow changes are not discarded wholesale'

Write-Host 'Release pipeline focused tests passed.'

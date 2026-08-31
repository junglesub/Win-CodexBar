#Requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installerScript = Join-Path $scriptRoot 'install-personal.ps1'

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

if (-not (Test-Path -LiteralPath $installerScript -PathType Leaf)) {
    throw "Missing production script: $installerScript"
}
$installerText = Get-Content -Raw -LiteralPath $installerScript
Assert-True ($installerText -notmatch '(?m)^\s*exit\s+\d+\s*$') 'entrypoint does not exit the PowerShell host'
. $installerScript

$installerName = 'CodexBar-2026.08.18-abc123-Setup.exe'
$installerAsset = [pscustomobject]@{
    name                 = $installerName
    browser_download_url = "https://example.test/$installerName"
}
$checksumAsset = [pscustomobject]@{
    name                 = "$installerName.sha256"
    browser_download_url = "https://example.test/$installerName.sha256"
}
$release = [pscustomobject]@{ assets = @($installerAsset, $checksumAsset) }

$selected = Select-PersonalReleaseAssets -Release $release
Assert-Equal $selected.InstallerAsset.name $installerName 'selects the one Setup asset'
Assert-Equal $selected.ChecksumAsset.name "$installerName.sha256" 'selects the exact installer checksum sidecar'

Assert-Throws {
    Select-PersonalReleaseAssets -Release ([pscustomobject]@{ assets = @($checksumAsset) })
} 'missing Setup asset is rejected'

Assert-Throws {
    Select-PersonalReleaseAssets -Release ([pscustomobject]@{
        assets = @($installerAsset, $installerAsset, $checksumAsset)
    })
} 'duplicate Setup assets are rejected'

$expectedHash = 'a' * 64
$checksumText = "$expectedHash  $installerName`r`n"
Assert-Equal (Get-PersonalChecksumHash -Content $checksumText -ExpectedFileName $installerName) $expectedHash 'release checksum format is accepted'

Assert-Throws {
    Get-PersonalChecksumHash -Content "$expectedHash  Other-Setup.exe`r`n" -ExpectedFileName $installerName
} 'checksum filename mismatch is rejected'

Assert-Throws {
    Get-PersonalChecksumHash -Content "not a checksum`r`n" -ExpectedFileName $installerName
} 'malformed checksum is rejected'

Assert-PersonalChecksum -Content $checksumText -ExpectedFileName $installerName -ActualHash ('A' * 64)
Assert-Throws {
    Assert-PersonalChecksum -Content $checksumText -ExpectedFileName $installerName -ActualHash ('b' * 64)
} 'hash mismatch is rejected'

Write-Host 'Personal installer focused tests passed.'

#Requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Select-PersonalReleaseAssets {
    [CmdletBinding()]
    param([Parameter(Mandatory)][psobject]$Release)

    $assets = @($Release.assets)
    $installerAssets = @($assets | Where-Object {
        $name = $_.name
        $name -is [string] -and
            $name -like 'CodexBar-*-Setup.exe' -and
            $name -notmatch '[\\/:*?"<>|]'
    })
    if ($installerAssets.Count -ne 1) {
        throw "Expected exactly one CodexBar Setup asset, found $($installerAssets.Count)."
    }

    $installer = $installerAssets[0]
    $checksumName = "$($installer.name).sha256"
    $checksumAssets = @($assets | Where-Object { $_.name -is [string] -and $_.name -ceq $checksumName })
    if ($checksumAssets.Count -ne 1) {
        throw "Expected exactly one checksum asset named '$checksumName', found $($checksumAssets.Count)."
    }

    foreach ($asset in @($installer, $checksumAssets[0])) {
        $url = [string]$asset.browser_download_url
        $uri = $null
        if ([string]::IsNullOrWhiteSpace($url) -or
            -not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -or
            $uri.Scheme -ne 'https') {
            throw "Asset '$($asset.name)' has no valid HTTPS download URL."
        }
    }

    return [pscustomobject]@{
        InstallerAsset = $installer
        ChecksumAsset  = $checksumAssets[0]
    }
}

function Get-PersonalChecksumHash {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory)][string]$ExpectedFileName
    )

    $line = $Content -replace "`r?`n$", ''
    $match = [regex]::Match($line, '^([0-9a-f]{64})  ([^\r\n]+)$')
    if (-not $match.Success) {
        throw 'Checksum must be 64 lowercase hexadecimal characters, two spaces, and the filename.'
    }
    if ($match.Groups[2].Value -cne $ExpectedFileName) {
        throw "Checksum filename '$($match.Groups[2].Value)' does not match '$ExpectedFileName'."
    }
    return $match.Groups[1].Value
}

function Assert-PersonalChecksum {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory)][string]$ExpectedFileName,
        [Parameter(Mandatory)][string]$ActualHash
    )

    $expectedHash = Get-PersonalChecksumHash -Content $Content -ExpectedFileName $ExpectedFileName
    if (-not [string]::Equals($expectedHash, $ActualHash, [StringComparison]::OrdinalIgnoreCase)) {
        throw "SHA-256 mismatch for '$ExpectedFileName'."
    }
}

function Invoke-PersonalInstaller {
    [CmdletBinding()]
    param()

    if (-not [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) {
        throw 'This installer must run on Windows.'
    }

    $releaseUri = 'https://api.github.com/repos/junglesub/Win-CodexBar/releases/tags/personal-latest'
    $release = Invoke-RestMethod -Uri $releaseUri `
        -Headers @{ 'User-Agent' = 'Win-CodexBar-personal-installer' } `
        -UseBasicParsing -ErrorAction Stop
    $selected = Select-PersonalReleaseAssets -Release $release

    $tempDir = $null
    try {
        $tempDir = Join-Path ([IO.Path]::GetTempPath()) ('win-codexbar-personal-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempDir -ErrorAction Stop | Out-Null

        $installerName = $selected.InstallerAsset.name
        $installerPath = Join-Path $tempDir $installerName
        $checksumPath = Join-Path $tempDir $selected.ChecksumAsset.name
        Invoke-WebRequest -Uri $selected.InstallerAsset.browser_download_url `
            -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
        Invoke-WebRequest -Uri $selected.ChecksumAsset.browser_download_url `
            -OutFile $checksumPath -UseBasicParsing -ErrorAction Stop

        $checksumText = Get-Content -LiteralPath $checksumPath -Raw -Encoding ASCII -ErrorAction Stop
        $actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
        Assert-PersonalChecksum -Content $checksumText -ExpectedFileName $installerName -ActualHash $actualHash

        $process = Start-Process -FilePath $installerPath -ArgumentList @(
            '/VERYSILENT',
            '/SUPPRESSMSGBOXES',
            '/NORESTART'
        ) -Wait -PassThru -ErrorAction Stop
        if ($process.ExitCode -notin @(0, 3010)) {
            throw "Installer exited with code $($process.ExitCode)."
        }
        Write-Host "CodexBar personal-latest installed ($installerName)."
    } finally {
        if ($null -ne $tempDir -and (Test-Path -LiteralPath $tempDir)) {
            Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        Invoke-PersonalInstaller
    } catch {
        throw "Personal installer failed: $($_.Exception.Message)"
    }
}

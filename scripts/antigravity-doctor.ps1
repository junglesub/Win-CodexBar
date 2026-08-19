#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnose Win-CodexBar's local Antigravity usage probe.

.DESCRIPTION
    Replays the provider's read-only path: process detection, listening-port
    discovery, API probing, RetrieveUserQuotaSummary, and GetUserStatus fallback.
    CSRF values and raw API responses are never printed.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Failures = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]

function Write-Ok {
    param([string]$Message)
    Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    $Warnings.Add($Message)
    Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    $Failures.Add($Message)
    Write-Host "[fail] $Message" -ForegroundColor Red
}

function Get-FlagValue {
    param([string]$CommandLine, [string]$Name)
    $pattern = "--$([regex]::Escape($Name))(?:\s+|\s*=\s*)(\S+)"
    if ($CommandLine -match $pattern) { return $Matches[1] }
    return $null
}

function Get-PropertyValue {
    param([object]$Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Invoke-LocalPost {
    param(
        [int]$Port,
        [string]$Method,
        [string]$Body,
        [string]$CsrfToken = "",
        [int]$TimeoutSeconds = 8
    )

    $url = "https://127.0.0.1:$Port/exa.language_server_pb.LanguageServerService/$Method"
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:CurlPath
    $escapedBody = $Body.Replace('"', '\"')
    $startInfo.Arguments = "--silent --insecure --max-time $TimeoutSeconds --request POST " +
        '--header "Content-Type: application/json" --header "Connect-Protocol-Version: 1" ' +
        "--data `"$escapedBody`" --write-out `"\n__STATUS__:%{http_code}\n`" `"$url`""
    if (-not [string]::IsNullOrEmpty($CsrfToken)) {
        $startInfo.Arguments += ' --variable %CODEXBAR_DOCTOR_CSRF ' +
            '--expand-header "X-Codeium-Csrf-Token: {{CODEXBAR_DOCTOR_CSRF}}"'
        $startInfo.EnvironmentVariables['CODEXBAR_DOCTOR_CSRF'] = $CsrfToken
    }
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $curl = [Diagnostics.Process]::Start($startInfo)
    $output = $curl.StandardOutput.ReadToEnd()
    $curlError = $curl.StandardError.ReadToEnd().Trim()
    $curl.WaitForExit()
    $curlExit = $curl.ExitCode
    $match = [regex]::Match($output, '(?s)^(.*)\r?\n__STATUS__:(\d{3})\r?\n?$')
    if (-not $match.Success -or [int]$match.Groups[2].Value -eq 0) {
        if (-not [string]::IsNullOrEmpty($CsrfToken)) { $curlError = $curlError.Replace($CsrfToken, '[redacted]') }
        return [pscustomobject]@{ Status = 0; Body = ""; Error = "curl exited ${curlExit}: $curlError" }
    }
    return [pscustomobject]@{
        Status = [int]$match.Groups[2].Value
        Body = $match.Groups[1].Value
        Error = ""
    }
}

function Find-ApiPort {
    param([int[]]$Ports)

    $curlArgs = @(
        '--silent', '--insecure', '--parallel', '--parallel-immediate',
        '--connect-timeout', '1', '--max-time', '2', '--request', 'POST',
        '--header', 'Content-Type: application/json',
        '--header', 'Connect-Protocol-Version: 1', '--data', '{}',
        '--write-out', '%{url_effective} %{http_code}\n'
    )
    foreach ($port in $Ports) {
        $curlArgs += '--output', 'NUL', '--url', "https://127.0.0.1:$port/exa.language_server_pb.LanguageServerService/GetUnleashData"
    }

    $statuses = @{}
    foreach ($line in @(& $script:CurlPath @curlArgs 2>$null)) {
        if ($line -match '^https://127\.0\.0\.1:(\d+)/.*\s+(200|401)$') {
            $statuses[[int]$Matches[1]] = [int]$Matches[2]
        }
    }
    foreach ($port in $Ports) {
        if ($statuses.ContainsKey($port)) {
            return [pscustomobject]@{ Port = $port; Status = $statuses[$port] }
        }
    }
    return $null
}

function Show-QuotaSummary {
    param([string]$Body)
    try { $json = $Body | ConvertFrom-Json } catch {
        Write-Warn "RetrieveUserQuotaSummary returned invalid JSON"
        return $false
    }

    $groups = Get-PropertyValue (Get-PropertyValue $json "response") "groups"
    if ($null -eq $groups) { $groups = Get-PropertyValue (Get-PropertyValue $json "summary") "groups" }
    if ($null -eq $groups) { $groups = Get-PropertyValue $json "groups" }

    $rows = @()
    foreach ($group in @($groups)) {
        $groupName = [string](Get-PropertyValue $group "displayName")
        if ($groupName -notmatch '(?i)gemini' -or $groupName -match '(?i)claude|gpt') { continue }
        foreach ($bucket in @((Get-PropertyValue $group "buckets"))) {
            $remaining = Get-PropertyValue $bucket "remainingFraction"
            if ($null -eq $remaining) {
                $remaining = Get-PropertyValue (Get-PropertyValue $bucket "remaining") "remainingFraction"
            }
            if ($null -eq $remaining) { continue }
            $remainingNumber = [Math]::Max(0.0, [Math]::Min(1.0, [double]$remaining))
            $rows += [pscustomobject]@{
                Group = $groupName
                Bucket = [string](Get-PropertyValue $bucket "displayName")
                Window = [string](Get-PropertyValue $bucket "window")
                UsedPercent = [Math]::Round((1.0 - $remainingNumber) * 100.0, 2)
                ResetTime = [string](Get-PropertyValue $bucket "resetTime")
            }
        }
    }

    if ($rows.Count -eq 0) {
        Write-Warn "quota summary has no usable Gemini bucket; provider would fall back"
        return $false
    }
    Write-Ok "RetrieveUserQuotaSummary contains $($rows.Count) usable Gemini bucket(s)"
    $rows | Format-Table -AutoSize | Out-Host
    return $true
}

function Show-UserStatus {
    param([string]$Body)
    try { $json = $Body | ConvertFrom-Json } catch {
        Write-Fail "GetUserStatus returned invalid JSON"
        return $false
    }

    $userStatus = Get-PropertyValue $json "userStatus"
    $configData = Get-PropertyValue $userStatus "cascadeModelConfigData"
    $configs = Get-PropertyValue $configData "clientModelConfigs"
    $rows = @()
    foreach ($config in @($configs)) {
        $quota = Get-PropertyValue $config "quotaInfo"
        if ($null -eq $quota) { continue }
        $label = [string](Get-PropertyValue $config "label")
        if ([string]::IsNullOrWhiteSpace($label)) { $label = [string](Get-PropertyValue $config "modelId") }
        if ([string]::IsNullOrWhiteSpace($label)) { $label = [string](Get-PropertyValue $config "id") }
        $remaining = Get-PropertyValue $quota "remainingFraction"
        $used = if ($null -eq $remaining) { "n/a" } else { [Math]::Round((1.0 - [double]$remaining) * 100.0, 2) }
        $rows += [pscustomobject]@{
            Model = $label
            UsedPercent = $used
            ResetTime = [string](Get-PropertyValue $quota "resetTime")
        }
    }

    if ($rows.Count -eq 0) {
        Write-Fail "GetUserStatus has no clientModelConfigs quota data"
        return $false
    }
    Write-Ok "GetUserStatus contains $($rows.Count) model quota row(s)"
    $rows | Format-Table -AutoSize | Out-Host
    return $true
}

Write-Host "Antigravity doctor (read-only)"

$curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue
if ($null -eq $curl) {
    Write-Fail "curl.exe was not found; install or enable the Windows curl executable"
    exit 1
}
$script:CurlPath = $curl.Source

$processes = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like '*language_server_windows*' -or
    $_.Name -like 'language_server.exe' -or
    $_.Name -eq 'agy.exe' -or
    $_.Name -eq 'agy'
})
if ($processes.Count -eq 0) {
    Write-Fail "no running Antigravity IDE language server or agy process found"
    Write-Host "Start Antigravity or agy, finish sign-in, and run this script again."
    exit 1
}

$detected = foreach ($process in $processes) {
    $commandLine = [string]$process.CommandLine
    $csrf = Get-FlagValue $commandLine "csrf_token"
    $extensionCsrf = Get-FlagValue $commandLine "extension_server_csrf_token"
    $port = Get-FlagValue $commandLine "extension_server_port"
    if ($null -eq $port) { $port = Get-FlagValue $commandLine "https_server_port" }
    $isCli = $process.Name -ieq 'agy.exe' -or $process.Name -ieq 'agy'
    if ($null -ne $csrf -or $isCli) {
        $listeningPorts = @()
        try {
            $listeningPorts = @(Get-NetTCPConnection -OwningProcess $process.ProcessId -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty LocalPort | Sort-Object -Unique)
        } catch {}
        [pscustomobject]@{
            Process = $process
            Source = if ($isCli) { "CLI" } else { "IDE" }
            Csrf = [string]$csrf
            ExtensionCsrf = [string]$extensionCsrf
            Port = if ($null -eq $port) { 0 } else { [int]$port }
            ListeningPorts = @($listeningPorts)
        }
    }
}

Write-Host "Detected process(es):"
$detected | Select-Object @{n='PID'; e={$_.Process.ProcessId}}, Source,
    @{n='Process'; e={$_.Process.Name}}, @{n='PortArg'; e={$_.Port}},
    @{n='ListeningPorts'; e={$_.ListeningPorts -join ', '}},
    @{n='CSRF'; e={-not [string]::IsNullOrEmpty($_.Csrf)}} |
    Format-Table -AutoSize | Out-Host

$selected = @($detected | Where-Object { $_.Source -eq "IDE" } | Select-Object -First 1)
if ($selected.Count -eq 0) { $selected = @($detected | Where-Object { $_.Source -eq "CLI" } | Select-Object -First 1) }
if ($selected.Count -eq 0) {
    Write-Fail "matching processes were present but none matched the provider's IDE/CLI rules"
    exit 1
}
$selected = $selected[0]
Write-Ok "selected $($selected.Source) process $($selected.Process.Name), PID $($selected.Process.ProcessId)"
Write-Host "     CSRF present: $(-not [string]::IsNullOrEmpty($selected.Csrf)); port argument: $($selected.Port)"

$candidatePorts = New-Object System.Collections.Generic.List[int]
foreach ($port in $selected.ListeningPorts) { $candidatePorts.Add([int]$port) }
if ($selected.ListeningPorts.Count -eq 0) {
    Write-Warn "could not enumerate PID listening ports; using fallback candidates"
}
if ($selected.Port -gt 0) {
    foreach ($port in $selected.Port..($selected.Port + 19)) {
        if (-not $candidatePorts.Contains($port)) { $candidatePorts.Add($port) }
    }
}
foreach ($port in 53835, 53836, 53837, 53838, 53845, 53849) {
    if (-not $candidatePorts.Contains($port)) { $candidatePorts.Add($port) }
}
Write-Ok "probing $($candidatePorts.Count) candidate port(s) in parallel"

$probe = Find-ApiPort -Ports $candidatePorts.ToArray()
if ($null -eq $probe) {
    Write-Fail "none of the candidate ports answered the expected language-server endpoint"
    exit 1
}
$apiPort = $probe.Port
Write-Ok "language-server API found at https://127.0.0.1:$apiPort (probe HTTP $($probe.Status))"

$metadataBody = '{"metadata":{"ideName":"antigravity","extensionName":"antigravity","ideVersion":"unknown","locale":"en"}}'
$requiresCsrf = $selected.Source -eq "IDE"
$primaryCsrf = if ($requiresCsrf -and -not [string]::IsNullOrEmpty($selected.ExtensionCsrf)) {
    $selected.ExtensionCsrf
} elseif ($requiresCsrf) { $selected.Csrf } else { "" }

$summary = Invoke-LocalPost -Port $apiPort -Method "RetrieveUserQuotaSummary" -Body $metadataBody -CsrfToken $primaryCsrf
if (($summary.Status -lt 200 -or $summary.Status -ge 300) -and $requiresCsrf -and -not [string]::IsNullOrEmpty($selected.ExtensionCsrf)) {
    Write-Warn "quota summary returned HTTP $($summary.Status); retrying with language-server CSRF"
    $summary = Invoke-LocalPost -Port $apiPort -Method "RetrieveUserQuotaSummary" -Body $metadataBody -CsrfToken $selected.Csrf
}

$summaryUsable = $false
if ($summary.Status -ge 200 -and $summary.Status -lt 300) {
    $summaryUsable = Show-QuotaSummary $summary.Body
} elseif ($summary.Status -eq 0) {
    Write-Warn "quota summary request failed: $($summary.Error)"
} else {
    Write-Warn "quota summary returned HTTP $($summary.Status); provider would fall back"
}

if (-not $summaryUsable) {
    $status = Invoke-LocalPost -Port $apiPort -Method "GetUserStatus" -Body $metadataBody -CsrfToken $primaryCsrf
    if (($status.Status -lt 200 -or $status.Status -ge 300) -and $requiresCsrf -and -not [string]::IsNullOrEmpty($selected.ExtensionCsrf)) {
        Write-Warn "GetUserStatus returned HTTP $($status.Status); retrying with language-server CSRF"
        $status = Invoke-LocalPost -Port $apiPort -Method "GetUserStatus" -Body $metadataBody -CsrfToken $selected.Csrf
    }
    if ($status.Status -ge 200 -and $status.Status -lt 300) {
        [void](Show-UserStatus $status.Body)
    } elseif ($status.Status -eq 0) {
        Write-Fail "GetUserStatus request failed: $($status.Error)"
    } else {
        Write-Fail "GetUserStatus returned HTTP $($status.Status)"
    }
}

Write-Host ""
Write-Host "Result: $($Failures.Count) failure(s), $($Warnings.Count) warning(s)"
if ($Failures.Count -gt 0) { exit 1 }
exit 0

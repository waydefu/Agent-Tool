param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('antigravity', 'codex')]
    [string]$App,
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 65535)]
    [int]$Port
)
# A loopback address and a tab URL are not proof of CDP process ownership.
$ErrorActionPreference = 'Stop'
$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
if ($listeners.Count -eq 0) { throw 'No local CDP listener found.' }
foreach ($listener in $listeners) {
    if ($listener.LocalAddress -notin @('127.0.0.1', '::1')) {
        throw 'CDP listener is not loopback-only.'
    }
}
$ownerIds = @($listeners | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique)
if ($ownerIds.Count -ne 1 -or $ownerIds[0] -le 0) {
    throw 'CDP listener does not have a single owner.'
}
$ownerProcess = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ownerIds[0]) -ErrorAction Stop
if (-not $ownerProcess -or -not $ownerProcess.ExecutablePath) {
    throw 'Cannot identify CDP listener executable.'
}
$exe = [string]$ownerProcess.ExecutablePath
if ($App -eq 'antigravity') {
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is unavailable.' }
    $expected = Join-Path $env:LOCALAPPDATA 'Programs\antigravity\Antigravity.exe'
    if (-not [string]::Equals($exe, $expected, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'CDP listener does not belong to the expected Antigravity executable.'
    }
} else {
    $storeExe = '^[A-Za-z]:\\Program Files\\WindowsApps\\OpenAI\.Codex_[^\\]+\\(?:app\\)?ChatGPT\.exe$'
    $desktopExe = '^[A-Za-z]:\\Program Files\\OpenAI\\Codex\\ChatGPT\.exe$'
    if ([IO.Path]::GetFileName($exe) -ine 'ChatGPT.exe' -or
        ($exe -notmatch $storeExe -and $exe -notmatch $desktopExe)) {
        throw 'CDP listener does not belong to an expected ChatGPT/Codex executable.'
    }
}
Write-Output 'AGENT_TOOL_CDP_OWNER_OK'

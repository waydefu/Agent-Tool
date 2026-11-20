# Synthetic Windows-only tests: override networking/process lookups; never inspect real user processes.
$ErrorActionPreference = 'Stop'
$verifier = Join-Path $PSScriptRoot '..\shared\Verify-CdpOwner.ps1'
$originalLocalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = 'C:\Users\synthetic\AppData\Local'
$global:AgentToolFakeListeners = @()
$global:AgentToolFakeProcess = $null

function Get-NetTCPConnection {
    param($LocalPort, $State, $ErrorAction)
    return $global:AgentToolFakeListeners
}
function Get-CimInstance {
    param($ClassName, $Filter, $ErrorAction)
    return $global:AgentToolFakeProcess
}
function Assert-Owner([string]$name, [string]$app, [bool]$shouldPass) {
    $passed = $false
    $reason = ''
    try {
        $output = @(& $verifier -App $app -Port 9339)
        $passed = $output -contains 'AGENT_TOOL_CDP_OWNER_OK'
    } catch {
        $passed = $false
        $reason = $_.Exception.Message
    }
    if ($passed -ne $shouldPass) {
        throw "CDP owner contract failed: $name (expected=$shouldPass, actual=$passed; reason=$reason)"
    }
    Write-Output "PASS $name"
}
try {
    $global:AgentToolFakeListeners = @([pscustomobject]@{ LocalAddress='127.0.0.1'; OwningProcess=3456 })
    $global:AgentToolFakeProcess = [pscustomobject]@{
        ExecutablePath='C:\Program Files\WindowsApps\OpenAI.Codex_2.0.0_x64__test\app\ChatGPT.exe'
    }
    Assert-Owner 'Trusted Codex Store executable' 'codex' $true

    $global:AgentToolFakeProcess.ExecutablePath = 'C:\Users\synthetic\Downloads\ChatGPT.exe'
    Assert-Owner 'Reject untrusted executable with matching filename' 'codex' $false

    $global:AgentToolFakeProcess.ExecutablePath = 'C:\Users\synthetic\AppData\Local\Programs\antigravity\Antigravity.exe'
    Assert-Owner 'Trusted Antigravity executable' 'antigravity' $true

    $global:AgentToolFakeListeners = @([pscustomobject]@{ LocalAddress='0.0.0.0'; OwningProcess=3456 })
    Assert-Owner 'Reject wildcard binding' 'antigravity' $false

    $global:AgentToolFakeListeners = @(
        [pscustomobject]@{ LocalAddress='127.0.0.1'; OwningProcess=3456 },
        [pscustomobject]@{ LocalAddress='::1'; OwningProcess=8999 }
    )
    Assert-Owner 'Reject conflicting listener PIDs' 'antigravity' $false

    $global:AgentToolFakeListeners = @()
    Assert-Owner 'Reject missing listener' 'antigravity' $false

    $global:AgentToolFakeListeners = @([pscustomobject]@{ LocalAddress='127.0.0.1'; OwningProcess=3456 })
    $global:AgentToolFakeProcess = [pscustomobject]@{ ExecutablePath='' }
    Assert-Owner 'Reject missing executable path' 'antigravity' $false
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
}

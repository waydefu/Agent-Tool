param([switch]$DryRun, [switch]$Force, [int]$IdleSeconds = 60)
# 安全關閉 Codex / ChatGPT Desktop 與其附屬的背景常駐行程（MCP 伺服器、node_repl、啟動器等）。
# 雙重安全鎖（絕不誤殺 Claude / Antigravity / Hermes 等其他軟體的 MCP）：
#  (1) 血緣鎖：父行程必須在 Codex 的真實行程樹內，且子行程建立時間 >= 父行程建立時間（排除 Windows PID 重用誤判）。
#  (2) 路徑與祖先白名單鎖：子行程本身或其直線 Codex 祖先必須明確帶有 `.codex`、`OpenAI\Codex`、`WindowsApps\OpenAI.Codex` 或為 Codex 直屬 MCP 行程，且命令列不得含有 `.claude`、`.gemini`、`antigravity`、`hermes`、`cursor`。
$ErrorActionPreference = 'SilentlyContinue'

$baseNames = @('ChatGPT', 'codex', 'codex-code-mode-host', 'codex-command-runner', 'codex-computer-use-swift')
$procs = @(Get-Process -Name $baseNames -ErrorAction SilentlyContinue)
if (-not $procs) {
    Write-Host 'Codex 目前沒有在執行。'
    Start-Sleep 2
    return
}

$all = @(Get-CimInstance Win32_Process)
$byId = @{}
foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }

# 只把確實屬於 OpenAI Codex / CodexDragon 的主行程放進根集合
$rootIds = [System.Collections.Generic.HashSet[int]]::new()
foreach ($p in $procs) {
    $cim = $byId[[int]$p.Id]
    $pathAndCmd = "$($cim.ExecutablePath) $($cim.CommandLine)"
    # 不以行程名稱單獨認定歸屬；只有 OpenAI Codex 安裝路徑或 .codex 工作路徑才可作為根行程。
    $trustedPath = $pathAndCmd -match 'OpenAI\.Codex_|OpenAI[\\/]Codex|[\\/]\.codex[\\/]'
    if ($trustedPath -and $pathAndCmd -notmatch '\.claude|\.gemini|antigravity|hermes|cursor') {
        [void]$rootIds.Add([int]$p.Id)
    }
}

function Is-TrueCodexChild($child, $parent) {
    if (-not $child -or -not $parent) { return $false }
    if ($child.CreationDate -and $parent.CreationDate -and $child.CreationDate -lt $parent.CreationDate) { return $false }
    $pathAndCmd = "$($child.ExecutablePath) $($child.CommandLine)"
    # 嚴格排除任何屬於其他 AI 工具（Claude / Antigravity / Hermes / Cursor）的路徑
    if ($pathAndCmd -match '[\\/\.]claude[\\/]|[\\/\.]gemini[\\/]|antigravity|hermes|cursor') { return $false }
    return $true
}

function Is-CodexDaemonHelper($p, $parent) {
    $n = [string]$p.Name
    $c = [string]$p.CommandLine
    $e = [string]$p.ExecutablePath
    $pc = if ($parent) { "$($parent.Name) $($parent.ExecutablePath) $($parent.CommandLine)" } else { '' }
    $isCodexPath = ($c -match '[\\/]\.codex[\\/]|OpenAI[\\/]Codex|WindowsApps[\\/]OpenAI\.Codex') -or
                   ($e -match '[\\/]\.codex[\\/]|OpenAI[\\/]Codex|WindowsApps[\\/]OpenAI\.Codex') -or
                   ($pc -match 'codex\.exe|[\\/]\.codex[\\/]|OpenAI[\\/]Codex|[\\/]mcp[\\/](launch|server)\.(cmd|mjs|js)')
    if (-not $isCodexPath) { return $false }
    if ($n -match '^(conhost|crashpad_handler|codex-code-mode-host|codex-computer-use-swift|node_repl|WallpaperHost)(\.exe)?$') { return $true }
    if ($c -match 'cua-repl\.mjs|require-browser-access\.mjs|[\\/]mcp[\\/](launch|server)\.(cmd|mjs|js)|--listen\s+grpc') { return $true }
    return $false
}

# 收集所有真正的子孫行程（最多往下追 4 層），區分「Codex 專屬常駐背景輔助」與「執行中的工作子行程」
$treeIds = [System.Collections.Generic.HashSet[int]]::new($rootIds)
$activeKids = [System.Collections.Generic.List[object]]::new()
$daemonKids = [System.Collections.Generic.List[object]]::new()

for ($depth = 0; $depth -lt 4; $depth++) {
    $added = $false
    foreach ($p in $all) {
        $pidInt = [int]$p.ProcessId
        $ppidInt = [int]$p.ParentProcessId
        if (-not $treeIds.Contains($pidInt) -and $treeIds.Contains($ppidInt)) {
            $parentObj = $byId[$ppidInt]
            if (Is-TrueCodexChild $p $parentObj) {
                [void]$treeIds.Add($pidInt)
                $added = $true
                if (-not $rootIds.Contains($pidInt)) {
                    if (Is-CodexDaemonHelper $p $parentObj) { $daemonKids.Add($p) }
                    else { $activeKids.Add($p) }
                }
            }
        }
    }
    if (-not $added) { break }
}

# 一併找出 launch-codex-hud.js 的 node 守護行程（限定命令列包含 launch-codex-hud.js）
$hudScript = [regex]::Escape((Join-Path $PSScriptRoot 'launch-codex-hud.js'))
$hudProcs = @($all | Where-Object { $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match $hudScript })

# 檢查最近 $IdleSeconds 秒內是否有對話紀錄正在寫入
$sess = "$env:USERPROFILE\.codex\sessions"
$recent = Get-ChildItem $sess -Recurse -File -Filter *.jsonl -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt (Get-Date).AddSeconds(-$IdleSeconds) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

$busy = @()
if ($activeKids.Count -gt 0) {
    $names = ($activeKids | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" } | Select-Object -Unique) -join ', '
    $busy += "還有執行中的工作子行程: $names"
}
if ($recent) {
    $ago = [int]((Get-Date) - $recent.LastWriteTime).TotalSeconds
    $busy += "對話紀錄在 $ago 秒前剛有寫入: $($recent.Name)"
}

if ($busy -and -not $Force) {
    Write-Host "Codex 可能還在工作，先不關閉:`n - $($busy -join "`n - ")"
    Write-Host '若確定要立刻強制關閉，請加上 -Force 參數，或等它做完再點一次。'
    Start-Sleep 5
    return
}

# 最終要清理的清單：只清理 Codex 主行程、已通過 Codex 路徑白名單驗證的常駐輔助行程（或 Force 下的子行程）、以及 HUD 啟動器
$killIds = [System.Collections.Generic.HashSet[int]]::new($rootIds)
foreach ($d in $daemonKids) { [void]$killIds.Add([int]$d.ProcessId) }
if ($Force) {
    foreach ($a in $activeKids) { [void]$killIds.Add([int]$a.ProcessId) }
}
foreach ($h in $hudProcs) { [void]$killIds.Add([int]$h.ProcessId) }

if ($DryRun) {
    Write-Host "目前判斷為閒置，可以安全關閉（試跑，未關閉）。"
    Write-Host (" - Codex 主行程與引擎: {0} 個｜Codex 專屬 MCP/REPL 子行程: {1} 個｜HUD 啟動器: {2} 個（合計 {3} 個）" -f $rootIds.Count, $daemonKids.Count, $hudProcs.Count, $killIds.Count)
    return
}

# 1. 先嘗試請求 ChatGPT 主視窗優雅關閉，讓 SQLite WAL 與視窗狀態正常落盤
$mainWins = @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
foreach ($w in $mainWins) { [void]$w.CloseMainWindow() }
if ($mainWins.Count -gt 0) { Start-Sleep -Milliseconds 1200 }

# 2. 清理所有殘留的 Codex 專屬行程
$remaining = @(Get-Process -Id ([int[]]@($killIds)) -ErrorAction SilentlyContinue)
if ($remaining) {
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host ("已安全且完整關閉 Codex（共清理 {0} 個行程，含 {1} 個 Codex 專屬 MCP/REPL 輔助行程）。" -f $killIds.Count, $daemonKids.Count)
Start-Sleep 2

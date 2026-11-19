param([switch]$DryRun, [switch]$Force, [int]$IdleSeconds = 60)
# 安全關閉 Codex / ChatGPT Desktop 與其附屬的背景常駐行程（MCP 伺服器、node_repl、啟動器等）。
# 判斷 Codex 是否還在執行任務：
#  (1) codex 底下有「真正的」使用者工作子行程（排除：建立時間早於父行程的 PID 重用假子行程、以及常駐 MCP / node_repl / conhost / crashpad 等背景服務）
#  (2) 最近 $IdleSeconds 秒內對話紀錄（*.jsonl）仍在寫入
$ErrorActionPreference = 'SilentlyContinue'

$baseNames = @('ChatGPT', 'codex', 'codex-code-mode-host', 'codex-command-runner', 'codex-computer-use-swift', 'WallpaperHost', 'Start-Codex-Dragon')
$procs = @(Get-Process -Name $baseNames -ErrorAction SilentlyContinue)
if (-not $procs) {
    Write-Host 'Codex 目前沒有在執行。'
    Start-Sleep 2
    return
}

$all = @(Get-CimInstance Win32_Process)
$byId = @{}
foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
$rootIds = [System.Collections.Generic.HashSet[int]]::new([int[]]@($procs.Id))

# 判斷是否為真正的後代行程（子行程建立時間必須 >= 父行程建立時間，避免 Windows PID 重用把系統常駐程式如 KeNotify/jusched 誤認成子行程）
function Is-TrueChild($child, $parent) {
    if (-not $child -or -not $parent) { return $false }
    if ($child.CreationDate -and $parent.CreationDate -and $child.CreationDate -lt $parent.CreationDate) { return $false }
    return $true
}

# 判斷是否為 Codex 內建的常駐背景輔助行程（非正在跑的使用者任務）
function Is-DaemonHelper($p) {
    $n = [string]$p.Name
    $c = [string]$p.CommandLine
    if ($n -match '^(conhost|crashpad_handler|codex-code-mode-host|codex-computer-use-swift|node_repl|WallpaperHost)(\.exe)?$') { return $true }
    if ($c -match 'cua-repl\.mjs|require-browser-access\.mjs|[\\/]mcp[\\/](launch|server)\.(cmd|mjs|js)|--listen\s+grpc') { return $true }
    return $false
}

# 收集所有真正的子孫行程（最多往下追 4 層），區分「常駐背景輔助」與「執行中的工作子行程」
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
            if (Is-TrueChild $p $parentObj) {
                [void]$treeIds.Add($pidInt)
                $added = $true
                if (-not $rootIds.Contains($pidInt)) {
                    if (Is-DaemonHelper $p) { $daemonKids.Add($p) }
                    else { $activeKids.Add($p) }
                }
            }
        }
    }
    if (-not $added) { break }
}

# 一併找出 launch-codex-hud.js 的 node 守護行程
$hudProcs = @($all | Where-Object { $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match 'launch-codex-hud\.js' })

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

$killIds = [System.Collections.Generic.HashSet[int]]::new($treeIds)
foreach ($h in $hudProcs) { [void]$killIds.Add([int]$h.ProcessId) }

if ($DryRun) {
    Write-Host "目前判斷為閒置，可以安全關閉（試跑，未關閉）。"
    Write-Host (" - 主行程與引擎: {0} 個｜常駐 MCP/REPL 子行程: {1} 個｜HUD 啟動器: {2} 個（合計 {3} 個）" -f $rootIds.Count, $daemonKids.Count, $hudProcs.Count, $killIds.Count)
    return
}

# 1. 先嘗試請求 ChatGPT 主視窗優雅關閉，讓 SQLite WAL 與視窗狀態正常落盤
$mainWins = @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
foreach ($w in $mainWins) { [void]$w.CloseMainWindow() }
if ($mainWins.Count -gt 0) { Start-Sleep -Milliseconds 1200 }

# 2. 清理所有殘留的樹狀行程（含常駐 MCP / node_repl / codex app-server）
$remaining = @(Get-Process -Id ([int[]]@($killIds)) -ErrorAction SilentlyContinue)
if ($remaining) {
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host ("已安全且完整關閉 Codex（共清理 {0} 個行程，含 {1} 個常駐 MCP/REPL 輔助行程）。" -f $killIds.Count, $daemonKids.Count)
Start-Sleep 2

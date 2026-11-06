# Fairy TTS bridge control (Windows, no tmux/GPT-SoVITS required).
#
# The bridge listens on 127.0.0.1:9880 and speaks the GPT-SoVITS `/tts` contract
# (raw PCM 32 kHz mono), but synthesises with Microsoft Edge TTS, which needs no
# local model. dsh-fairy-voice already points at that URL, so the voice UI works
# as soon as this service runs.
#
#   -Action run|start|stop|restart|status   (default: start)
#   -Voice    <edge voice>   default zh-CN-XiaoxiaoNeural
#   -NoWait                  do not wait for the health endpoint
#
# Examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -File start-fairy-tts.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File start-fairy-tts.ps1 -Action status
#   powershell -NoProfile -ExecutionPolicy Bypass -File start-fairy-tts.ps1 -Voice zh-CN-XiaoyiNeural -Action restart
param(
    [ValidateSet('run', 'start', 'stop', 'restart', 'status')]
    [string]$Action = 'start',
    [string]$Voice = 'zh-CN-XiaoxiaoNeural',
    [switch]$NoWait
)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tree      = Split-Path -Parent $ScriptDir
$Bridge    = Join-Path $ScriptDir 'fairy-tts-bridge.cjs'
$StateDir  = if ($env:DSH_HOME) { Join-Path $env:DSH_HOME 'state\fairy-tts' } else { Join-Path $env:USERPROFILE '.dsh\state\fairy-tts' }
$LogFile   = Join-Path $StateDir 'bridge.log'
$Port      = 9880
$HealthUrl = "http://127.0.0.1:$Port/health"

function Find-Node {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($c in @('D:\DSH\resources\runtime\bin\node.exe', "$env:ProgramFiles\nodejs\node.exe")) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Find-Ffmpeg {
    $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $pattern = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Gyan.FFmpeg_*\**\bin\ffmpeg.exe'
    $hit = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
    return $null
}

function Test-Bridge {
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Get-BridgeProcess {
    $conns = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -gt 0 -and ("$($_.State)" -eq '' -or "$($_.State)" -eq 'Listen') })
    return @($conns | ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } | Where-Object { $_ } | Select-Object -Unique -First 1)
}

function Start-Bridge {
    if (Test-Bridge) { Write-Host "already running: http://127.0.0.1:$Port"; return $true }
    $node = Find-Node
    if (-not $node) { Write-Host 'node not found' -ForegroundColor Red; return $false }
    $ffmpeg = Find-Ffmpeg
    if (-not $ffmpeg) { Write-Host 'ffmpeg not found (winget install Gyan.FFmpeg)' -ForegroundColor Red; return $false }
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

    $env:FAIRY_TTS_VOICE = $Voice
    $env:FAIRY_TTS_FFMPEG = $ffmpeg
    $env:FAIRY_TTS_PORT = "$Port"
    $env:FAIRY_TTS_MODULE = (Join-Path $Tree 'node_modules\msedge-tts')
    Start-Process -FilePath $node -ArgumentList @($Bridge) -WindowStyle Hidden -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err" | Out-Null

    if ($NoWait) { Write-Host "starting bridge on port $Port (voice $Voice)"; return $true }
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Bridge) { Write-Host "started: http://127.0.0.1:$Port (voice $Voice)"; return $true }
    }
    Write-Host "bridge did not answer within 10 s; see $LogFile" -ForegroundColor Red
    return $false
}

function Stop-Bridge {
    $proc = Get-BridgeProcess
    if (-not $proc) { Write-Host 'not running'; return $true }
    Write-Host "stopping pid $($proc.Id)"
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host 'stopped'
    return $true
}

switch ($Action) {
    'run' { $null = Start-Bridge }   # used by the logon task; keeps a hidden instance
    'start' { if (-not (Start-Bridge)) { exit 1 } }
    'stop' { $null = Stop-Bridge }
    'restart' { $null = Stop-Bridge; Start-Sleep -Seconds 1; if (-not (Start-Bridge)) { exit 1 } }
    'status' {
        $proc = Get-BridgeProcess
        if (Test-Bridge) {
            Write-Host "running on http://127.0.0.1:$Port (pid $($proc.Id))"
            try { (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3).Content } catch {}
        } else {
            Write-Host 'not running'
            if (Test-Path $LogFile) { Write-Host "last log: $(Get-Content $LogFile -Tail 1)" }
        }
    }
}

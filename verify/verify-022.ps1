# Boot the rehearsed 0.2.2 profile long enough to inspect the served client boot graph.
# Requires the rehearsal home to exist (rehearse.ps1 creates %TEMP%\fairy-rehearsal\<name>\home).
param(
  [string]$RootName = 'v022app',
  [string]$DshPath = 'D:\DSH\resources\runtime\cli\bin\dsh.cmd',
  [int]$TimeoutSec = 150
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Join-Path $env:TEMP ("fairy-rehearsal\" + $RootName)
$homeDir = Join-Path $root 'home'
if (-not (Test-Path $homeDir)) { throw "rehearsal home missing: $homeDir (run rehearse.ps1 first)" }
$verify = Join-Path $PSScriptRoot 'verify-022-client.mjs'
$out = Join-Path $root 'verify-stdout.log'
$err = Join-Path $root 'verify-stderr.log'
Remove-Item $out, $err -ErrorAction SilentlyContinue

$oldHome = $env:DSH_HOME; $oldProfile = $env:DSH_PROFILE; $oldUrl = $env:DSH_WEB_URL
$env:DSH_HOME = $homeDir
Remove-Item Env:\DSH_PROFILE -ErrorAction SilentlyContinue
Remove-Item Env:\DSH_WEB_URL -ErrorAction SilentlyContinue

$p = Start-Process -FilePath $DshPath -ArgumentList @('--profile', 'fairycheck', '--no-open', '--port', '0') `
  -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -NoNewWindow -WorkingDirectory $root
$url = $null
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $out) {
    $m = Select-String -Path $out -Pattern 'dsh web: (http://\S+)' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Groups[1].Value; break }
  }
  if ($p.HasExited) { break }
  Start-Sleep -Milliseconds 700
}
if (-not $url) {
  Write-Host 'FAIL: server did not start'
  Get-Content $err -ErrorAction SilentlyContinue | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
  try { & taskkill /T /F /PID $p.Id 2>&1 | Out-Null } catch {}
  exit 1
}
Write-Host "url: $url"
node $verify $url
$code = $LASTEXITCODE
try { & taskkill /T /F /PID $p.Id 2>&1 | Out-Null } catch {}
Start-Sleep -Milliseconds 800
$env:DSH_HOME = $oldHome
if ($oldProfile) { $env:DSH_PROFILE = $oldProfile }
if ($oldUrl) { $env:DSH_WEB_URL = $oldUrl }
exit $code

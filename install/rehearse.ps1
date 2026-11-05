<#
.SYNOPSIS
  Boot a throw-away copy of the desktop profile with a staged patch variant.
  Nothing live is modified: the copy lives in %TEMP%, uses a non-reserved
  profile name, its own DSH_HOME and its own port; the running app is never
  signalled. node_modules is copied once and reused across variants.

.EXAMPLE
  .\rehearse.ps1 -Patch desktop-cordis.isolated.yml
  .\rehearse.ps1 -Patch desktop-cordis.patch.yml
#>
param(
  [Parameter(Mandatory = $true)][string]$Patch,
  [int]$TimeoutSec = 180,
  [switch]$Fresh,
  [string]$DshPath = 'D:\DSH\resources\runtime\cli\bin\dsh.cmd',
  [string]$RootName = 'shared'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Live = 'C:\Users\shawn\.dsh\profiles\desktop'
$Dsh = $DshPath
$Root = Join-Path $env:TEMP ("fairy-rehearsal\" + $RootName)
$HomeDir = Join-Path $Root 'home'
$Profile = Join-Path $HomeDir 'profiles\fairycheck'
$Nm = Join-Path $Profile 'node_modules'

if (-not (Test-Path (Join-Path $Here $Patch))) { throw "patch not found: $Patch" }
if ($Fresh -and (Test-Path $Root)) { Remove-Item $Root -Recurse -Force }

New-Item -ItemType Directory -Force -Path $Profile | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HomeDir 'state') | Out-Null
Copy-Item (Join-Path $Live 'package.json') (Join-Path $Profile 'package.json') -Force
if (Test-Path (Join-Path $Live 'pnpm-workspace.yaml')) {
  Copy-Item (Join-Path $Live 'pnpm-workspace.yaml') (Join-Path $Profile 'pnpm-workspace.yaml') -Force
}
$text = [System.IO.File]::ReadAllText((Join-Path $Here $Patch), [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $Profile 'cordis.patch.yml'), $text, (New-Object System.Text.UTF8Encoding($false)))

if (-not (Test-Path (Join-Path $Nm 'dsh-at-file'))) {
  Write-Host 'copying live profile node_modules (264 MB, one time) ...'
  $r = robocopy (Join-Path $Live 'node_modules') $Nm /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1
  Write-Host "robocopy exit=$LASTEXITCODE"
}
if (-not (Test-Path (Join-Path $HomeDir '.agent-presets')) -and (Test-Path 'C:\Users\shawn\.dsh\.agent-presets')) {
  Copy-Item 'C:\Users\shawn\.dsh\.agent-presets' (Join-Path $HomeDir '.agent-presets') -Recurse -Force
}

$Stamp = Get-Date -Format 'HHmmss'
$outLog = Join-Path $Root "stdout-$Stamp.log"
$errLog = Join-Path $Root "stderr-$Stamp.log"

$oldHome = $env:DSH_HOME; $oldProfile = $env:DSH_PROFILE; $oldUrl = $env:DSH_WEB_URL
$env:DSH_HOME = $HomeDir
Remove-Item Env:\DSH_PROFILE -ErrorAction SilentlyContinue
Remove-Item Env:\DSH_WEB_URL -ErrorAction SilentlyContinue

Write-Host "home    : $HomeDir"
Write-Host "variant : $Patch"
$p = Start-Process -FilePath $Dsh -ArgumentList @('--profile', 'fairycheck', '--no-open', '--port', '0') `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -NoNewWindow -WorkingDirectory $Root
Write-Host "pid=$($p.Id) waiting up to ${TimeoutSec}s for the web line ..."

$url = $null
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $outLog) {
    $m = Select-String -Path $outLog -Pattern 'dsh web: (http://\S+)' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Groups[1].Value; break }
  }
  if ($p.HasExited) { break }
  Start-Sleep -Milliseconds 700
}
Start-Sleep -Seconds 3
try { & taskkill /T /F /PID $p.Id 2>&1 | Out-Null } catch { }

$env:DSH_HOME = $oldHome
if ($oldProfile) { $env:DSH_PROFILE = $oldProfile }
if ($oldUrl) { $env:DSH_WEB_URL = $oldUrl }

$out = if (Test-Path $outLog) { Get-Content $outLog -Encoding UTF8 } else { @() }
$err = if (Test-Path $errLog) { Get-Content $errLog -Encoding UTF8 } else { @() }
$all = @($out) + @($err)
$bad = $all | Where-Object { $_ -match 'failed to import|disabling profile plugin row|ERR_MODULE|skipping profile bundle|not found:|Error:' }
$applies = $all | Where-Object { $_ -match '"operation":"apply"' }
$failApplies = @($applies | Where-Object { $_ -notmatch '"outcome":"success"' })
$fairyApplied = @($applies | Where-Object { $_ -match 'fairy|balance-meter|browser-dock' })

Write-Host ''
Write-Host "web url      : $(if ($url) { $url } else { 'NONE' })"
Write-Host "apply lines  : $($applies.Count) (non-success: $($failApplies.Count), fairy: $($fairyApplied.Count))"
Write-Host "problem lines: $(@($bad).Count)"
if (@($bad).Count) { Write-Host '--- problems ---'; @($bad) | Select-Object -First 25 | ForEach-Object { Write-Host "  $_" } }
Write-Host "logs         : $outLog"
$pass = ($null -ne $url) -and (@($bad).Count -eq 0) -and ($failApplies.Count -eq 0)
Write-Host ''
Write-Host ($(if ($pass) { 'PASS' } else { 'FAIL' })) -ForegroundColor $(if ($pass) { 'Green' } else { 'Red' })
exit $(if ($pass) { 0 } else { 1 })

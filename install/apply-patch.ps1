# Apply a staged desktop-profile patch, with a timestamped backup.
# Run outside the DSH sandbox (it writes to ~/.dsh). Does not restart the app.
#
#   .\apply-patch.ps1                              # desktop-cordis.patch.yml (fairy + everything as-is)
#   .\apply-patch.ps1 -Staged desktop-cordis.isolated.yml   # fairy only, other third-party rows disabled
param(
  [string]$Staged = 'desktop-cordis.patch.yml'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Live = 'C:\Users\shawn\.dsh\profiles\desktop\cordis.patch.yml'
$StagedPath = Join-Path $Here $Staged
$Utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $StagedPath)) { throw "staged patch missing: $StagedPath (run node build-patch.mjs first)" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $Here "backup-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
if (Test-Path $Live) {
  Copy-Item $Live (Join-Path $backupDir 'cordis.patch.yml') -Force
  Write-Host "backup -> $backupDir\cordis.patch.yml"
} else {
  Write-Warning "live patch not found: $Live (nothing to back up)"
}

$stagedText = [System.IO.File]::ReadAllText($StagedPath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($Live, $stagedText, $Utf8)
Write-Host "staged  $StagedPath"
Write-Host "wrote   $Live ($((Get-Content $Live -Encoding UTF8).Count) lines)"
Write-Host "restart the DeepSeek Harness app to apply. Rollback: .\uninstall.ps1"

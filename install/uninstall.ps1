# Roll back the Fairy DSH install:
#   1. restore the newest profile-patch backup (or strip the appended blocks)
#   2. remove the external plugin tree
#   3. remove the copied agent preset
# Does not restart the app.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Live = 'C:\Users\shawn\.dsh\profiles\desktop\cordis.patch.yml'
$Tree = 'C:\Users\shawn\.dsh\plugin-suite\fairy-dsh'
$Preset = 'C:\Users\shawn\.dsh\.agent-presets\fairy'

$backups = Get-ChildItem $Here -Directory -Filter 'backup-*' |
  Where-Object { Test-Path (Join-Path $_.FullName 'cordis.patch.yml') } |
  Sort-Object Name -Descending
if ($backups) {
  Copy-Item (Join-Path $backups[0].FullName 'cordis.patch.yml') $Live -Force
  Write-Host "restored profile patch from $($backups[0].Name)"
} else {
  Write-Warning 'no backup found; leaving cordis.patch.yml untouched (remove the fairy/disable blocks by hand)'
}

if (Test-Path $Tree) { Remove-Item $Tree -Recurse -Force; Write-Host "removed $Tree" }
if (Test-Path $Preset) { Remove-Item $Preset -Recurse -Force; Write-Host "removed $Preset" }
Write-Host 'done — restart the app to unload the plugins.'

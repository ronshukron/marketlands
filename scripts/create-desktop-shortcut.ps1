$ErrorActionPreference = 'Stop'

$scriptsDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptsDir '..')).Path
$cmdPath = Join-Path $scriptsDir 'launch-delivery-v7.cmd'
$iconPath = Join-Path $repoRoot 'public\favicon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Delivery V7 - ชั่งน้ำหนัก.lnk'

if (-not (Test-Path $cmdPath)) {
  throw "Launcher not found: $cmdPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $cmdPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Open Delivery V7 for today (scale + printer)'
if (Test-Path $iconPath) {
  $shortcut.IconLocation = "$iconPath,0"
}
$shortcut.Save()

Write-Host "Created desktop shortcut: $lnkPath"

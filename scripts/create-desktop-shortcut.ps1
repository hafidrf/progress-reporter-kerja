# Create Desktop shortcut for Progress Reporter Kerja
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) -Parent
$vbs = Join-Path $appRoot 'start-app.vbs'
$electronExe = Join-Path $appRoot 'node_modules\electron\dist\electron.exe'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Progress Reporter Kerja.lnk'

if (-not (Test-Path $vbs)) {
    throw "start-app.vbs not found: $vbs"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($lnkPath)
$shortcut.TargetPath = 'wscript.exe'
$shortcut.Arguments = "`"$vbs`""
$shortcut.WorkingDirectory = $appRoot
$shortcut.Description = 'Progress Reporter Kerja — update Discord harian'
$shortcut.WindowStyle = 7
if (Test-Path $electronExe) {
    $shortcut.IconLocation = "$electronExe,0"
}
$shortcut.Save()

Write-Host "Shortcut dibuat: $lnkPath"

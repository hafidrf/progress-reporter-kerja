# Launch Progress Reporter Kerja (used by desktop shortcut)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$distHtml = Join-Path $here 'dist\index.html'
$mainJs = Join-Path $here 'dist-electron\main.js'
$electron = Join-Path $here 'node_modules\electron\dist\electron.exe'

function Show-Error([string]$msg) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($msg, 'Progress Reporter Kerja') | Out-Null
}

if (-not (Test-Path $electron)) {
    Show-Error "Electron belum terpasang.`nJalankan dulu: npm install di folder progress-reporter-kerja"
    exit 1
}

if (-not (Test-Path $distHtml) -or -not (Test-Path $mainJs)) {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Show-Error "Build gagal. Buka PowerShell di folder app lalu jalankan: npm run build"
        exit 1
    }
}

Start-Process -FilePath $electron -ArgumentList '.' -WorkingDirectory $here

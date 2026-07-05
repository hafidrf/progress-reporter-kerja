$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $here 'run-daily.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host 'Scheduler tidak berjalan.'
    exit 0
}

$schedulerPid = (Get-Content $pidFile -Raw).Trim()
if ($schedulerPid -and (Get-Process -Id $schedulerPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $schedulerPid -Force
    Write-Host "Scheduler dihentikan (PID $schedulerPid)."
} else {
    Write-Host 'Proses scheduler tidak ditemukan.'
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

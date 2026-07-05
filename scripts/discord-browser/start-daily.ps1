# Satu perintah untuk seharian - kirim semua pesan sesuai jadwal di messages-pending.json
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$pidFile = Join-Path $here 'run-daily.pid'
if (Test-Path $pidFile) {
    $oldPid = (Get-Content $pidFile -Raw).Trim()
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "Scheduler sudah berjalan (PID $oldPid)."
        Write-Host "Log: $here\run-daily.log"
        exit 0
    }
}

$queue = Get-Content (Join-Path $here 'messages-pending.json') -Raw | ConvertFrom-Json
$count = @($queue.pending).Count

if ($count -eq 0) {
    Write-Host 'Tidak ada pesan pending. Edit messages-pending.json dulu.'
    exit 1
}

Write-Host "Memulai scheduler harian - $count pesan akan dikirim otomatis."
Write-Host ''
foreach ($item in $queue.pending) {
    Write-Host "  $($item.scheduled)  $($item.id)"
}
Write-Host ''
Write-Host 'Biarkan PC menyala. Log: run-daily.log'
Write-Host 'Stop: .\stop-daily.ps1'
Write-Host ''

Start-Process -FilePath 'node' -ArgumentList 'run-daily.mjs' -WorkingDirectory $here -WindowStyle Hidden

Start-Sleep -Seconds 2
if (Test-Path $pidFile) {
    $schedulerPid = (Get-Content $pidFile -Raw).Trim()
    Write-Host "Scheduler aktif - PID $schedulerPid"
} else {
    Write-Host 'Scheduler dimulai. Cek run-daily.log untuk status.'
}

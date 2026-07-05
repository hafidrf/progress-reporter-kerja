# Buka Chrome terpisah khusus Discord automation (tidak ganggu Chrome kerja).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$profileDir = Join-Path $here 'chrome-profile'
$configPath = Join-Path $here 'config.json'
$examplePath = Join-Path $here 'config.example.json'

if (-not (Test-Path $configPath)) {
    if (Test-Path $examplePath) {
        Copy-Item $examplePath $configPath
    } else {
        throw 'config.json tidak ditemukan. Salin config.example.json ke config.json lalu isi channelUrl.'
    }
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$discordUrl = $config.channelUrl
if (-not $discordUrl -or $discordUrl -match 'YOUR_GUILD_ID') {
    throw 'Isi channelUrl di scripts/discord-browser/config.json sebelum setup Discord.'
}

$chromePaths = @(
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Google Chrome not found.' }

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Write-Host 'Membuka Chrome profil terpisah (Discord automation)...'
Write-Host "Target: $discordUrl"
Write-Host '1. Login Discord jika diminta'
Write-Host '2. Pastikan channel target terbuka'
Write-Host '3. Tutup jendela Chrome ini setelah selesai'
Write-Host ''

Start-Process -FilePath $chrome -ArgumentList @(
    "--user-data-dir=`"$profileDir`"",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    $discordUrl
)

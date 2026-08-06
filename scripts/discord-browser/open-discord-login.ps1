# Thin Windows wrapper — prefer: node open-discord-login.mjs
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
node "$here\open-discord-login.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

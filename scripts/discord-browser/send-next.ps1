param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$argsList = @('send-discord.mjs', '--next')
if ($DryRun) { $argsList += '--dry-run' }

node @argsList

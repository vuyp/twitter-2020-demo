[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeArgs = @(
  'compose',
  '-p', 'twitter2020',
  '-f', 'docker-compose.yml',
  '-f', 'docker-compose.local.yml'
)

Push-Location $projectRoot
try {
  & wsl.exe -d $Distro -- docker @composeArgs down
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'wsl.exe' -and $_.CommandLine -match 'twitter2020-keepalive'
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host 'Twitter is stopped. Local database and media volumes were preserved.' -ForegroundColor Yellow

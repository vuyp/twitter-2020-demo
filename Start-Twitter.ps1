[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu',
  [switch]$NoOpen
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
  $keepalive = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'wsl.exe' -and $_.CommandLine -match 'twitter2020-keepalive'
  } | Select-Object -First 1

  if (-not $keepalive) {
    $keepaliveCommand = '"exec -a twitter2020-keepalive sleep infinity"'
    Start-Process -FilePath wsl.exe -ArgumentList @('-d', $Distro, '--exec', 'bash', '-lc', $keepaliveCommand) -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 2
  }

  & wsl.exe -d $Distro -- docker @composeArgs up -d
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }

  $ready = $false
  foreach ($attempt in 1..30) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1/api/health/ready' -TimeoutSec 3
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $ready) {
    throw 'Twitter did not become ready within 30 seconds.'
  }

  Write-Host 'Twitter is ready at http://localhost' -ForegroundColor Green
  Write-Host 'Verification emails are at http://localhost:8125'
  if (-not $NoOpen) {
    Start-Process 'http://localhost'
  }
} finally {
  Pop-Location
}

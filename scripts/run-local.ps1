$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RootDir "nexaacs-web"
$EnvFile = Join-Path $RootDir ".env"
Set-Location $RootDir

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split "=", 2
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"').Trim("'")
            if ($key -and -not (Get-Item "Env:$key" -ErrorAction SilentlyContinue)) {
                Set-Item -Path "Env:$key" -Value $val
            }
        }
    }
}

if (-not $env:NEXAACS_DB_DSN) {
    throw "NEXAACS_DB_DSN is not set. Copy .env.example to .env and configure your PostgreSQL credentials."
}
if (-not $env:NEXAACS_JWT_SIGNING_KEY) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $env:NEXAACS_JWT_SIGNING_KEY = ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    Write-Host "Generated ephemeral dev NEXAACS_JWT_SIGNING_KEY for this session." -ForegroundColor Yellow
}
if (-not $env:NEXAACS_SECRET_MASTER_KEY) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $env:NEXAACS_SECRET_MASTER_KEY = ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    Write-Host "Generated ephemeral dev NEXAACS_SECRET_MASTER_KEY for this session." -ForegroundColor Yellow
}

$GoBin = "C:\Program Files\Go\bin\go.exe"
if (-not (Test-Path $GoBin)) {
    $GoBin = "go"
}

if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
    Write-Host "Installing frontend dependencies in nexaacs-web..." -ForegroundColor Cyan
    & npm --prefix $WebDir install
}

Write-Host ""
Write-Host "Starting NexACS Backend (go run) & Frontend (Vite)..." -ForegroundColor Green
Write-Host "  UI (Web)    : http://localhost:8000"
Write-Host "  API (NBI)   : http://127.0.0.1:7557"
Write-Host "  CWMP (ACS)  : http://0.0.0.0:7547/cwmp"
Write-Host "  File Server : http://0.0.0.0:7567"
Write-Host "  USP         : http://127.0.0.1:8085/usp"
Write-Host "  Worker      : Active"
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow
Write-Host ""

$beProcs = @(
    Start-Process -FilePath $GoBin -ArgumentList "run ./cmd/api -config configs/config.yaml" -WorkingDirectory $RootDir -PassThru -NoNewWindow
    Start-Process -FilePath $GoBin -ArgumentList "run ./cmd/cwmp -config configs/config.yaml" -WorkingDirectory $RootDir -PassThru -NoNewWindow
    Start-Process -FilePath $GoBin -ArgumentList "run ./cmd/usp -config configs/config.yaml" -WorkingDirectory $RootDir -PassThru -NoNewWindow
    Start-Process -FilePath $GoBin -ArgumentList "run ./cmd/worker -config configs/config.yaml" -WorkingDirectory $RootDir -PassThru -NoNewWindow
)
$feProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $WebDir -PassThru -NoNewWindow
$allProcs = $beProcs + @($feProc)

try {
    Wait-Process -Id ($allProcs | Select-Object -ExpandProperty Id)
} finally {
    foreach ($p in $allProcs) {
        if ($p -and -not $p.HasExited) {
            & taskkill /PID $p.Id /T /F 2>$null | Out-Null
        }
    }
}

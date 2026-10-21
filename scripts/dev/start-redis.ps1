# Starts the portable Redis 8 build in tools/redis on port 6380 (no Docker, no service).
# Run from PowerShell: Git Bash ships its own msys runtime that clashes with this build.
$ErrorActionPreference = "Stop"
$redisDir = Join-Path $PSScriptRoot "..\..\tools\redis" | Resolve-Path
if (-not (Test-Path (Join-Path $redisDir "redis-server.exe"))) {
    throw "Redis not found in $redisDir. See README > Local development."
}
New-Item -ItemType Directory -Force (Join-Path $redisDir "data") | Out-Null
Set-Location $redisDir
& .\redis-server.exe taskforge.conf

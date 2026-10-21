# Downloads a portable Redis build for Windows into tools/redis and verifies its checksum.
# Source: https://github.com/redis-windows/redis-windows (community MSYS2 builds).
$ErrorActionPreference = "Stop"
$version = "8.10.2"
$sha256 = "7C8CEBD50347EAA1D9E784DA842ED47A4F33394637835531D6614777B950EE85"
$url = "https://github.com/redis-windows/redis-windows/releases/download/$version/Redis-$version-Windows-x64-msys2.zip"

$root = Join-Path $PSScriptRoot "..\.." | Resolve-Path
$target = Join-Path $root "tools\redis"
if (Test-Path (Join-Path $target "redis-server.exe")) {
    Write-Host "Redis already installed in $target"
    exit 0
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) "taskforge-redis-$version"
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp "redis.zip"
Write-Host "Downloading Redis $version..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

$actual = (Get-FileHash $zip -Algorithm SHA256).Hash
if ($actual -ne $sha256) {
    Remove-Item -Recurse -Force $tmp
    throw "Checksum mismatch for $url (got $actual)"
}

Expand-Archive $zip -DestinationPath $tmp -Force
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Recurse -Force (Join-Path $tmp "Redis-$version-Windows-x64-msys2\*") $target
Remove-Item -Recurse -Force $tmp

@"
# Local dev Redis for TaskForge (portable build, no Docker).
# Runs on 6380 so it doesn't collide with any other Redis on 6379.
port 6380
bind 127.0.0.1
protected-mode yes
dir ./data
appendonly yes
save 60 1
loglevel notice
"@ | Set-Content -Encoding ascii (Join-Path $target "taskforge.conf")
New-Item -ItemType Directory -Force (Join-Path $target "data") | Out-Null
Write-Host "Redis $version installed in $target. Start it with scripts\dev\start-redis.ps1"

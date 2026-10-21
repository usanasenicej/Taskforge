# Opens Redis, API, worker and frontend, each in its own PowerShell window.
#   powershell -ExecutionPolicy Bypass -File scripts\dev\start-all.ps1
$ErrorActionPreference = "Stop"

function Start-DevWindow([string]$Title, [string]$Script) {
    $path = Join-Path $PSScriptRoot $Script
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-ExecutionPolicy", "Bypass",
        "-Command", "`$Host.UI.RawUI.WindowTitle = 'TaskForge - $Title'; & '$path'"
    )
}

Start-DevWindow "Redis" "start-redis.ps1"
Start-Sleep -Seconds 2   # let Redis bind before the API and worker probe it
Start-DevWindow "API" "start-api.ps1"
Start-DevWindow "Worker" "start-worker.ps1"
Start-DevWindow "Frontend" "start-frontend.ps1"

Write-Host "TaskForge is starting:"
Write-Host "  App       http://localhost:3000   (owner@taskforge.local / password123)"
Write-Host "  API docs  http://127.0.0.1:8000/docs"

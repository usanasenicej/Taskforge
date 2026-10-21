# RQ background worker: emails, notifications and the periodic overdue scan.
# Needs Redis running (start-redis.ps1). Restart it after changing job code.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\.." | Resolve-Path)
& .\.venv\Scripts\python.exe -m app.workers.worker

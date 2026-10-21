# FastAPI with auto-reload on http://127.0.0.1:8000 (docs at /docs).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\.." | Resolve-Path)
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app

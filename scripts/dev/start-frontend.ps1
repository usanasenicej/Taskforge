# Vite dev server on http://localhost:3000, proxying /api and /health to the API.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..\frontend" | Resolve-Path)
if (-not (Test-Path node_modules)) { npm install }
npm run dev

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Write-Host 'Optimus Orien — Public homepage / School setup acceptance checks' -ForegroundColor Cyan
if (-not (Test-Path "$root\backend\.venv\Scripts\python.exe")) { throw 'Install backend dependencies in backend\.venv first (see README).' }
Push-Location "$root\backend"
try {
  & .\.venv\Scripts\python.exe manage.py check
  if ($LASTEXITCODE -ne 0) { throw 'Django system check failed' }
  & .\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
  if ($LASTEXITCODE -ne 0) { throw 'Uncommitted Django migration changes detected' }
  & .\.venv\Scripts\python.exe manage.py migrate
  if ($LASTEXITCODE -ne 0) { throw 'Database migration failed' }
  & .\.venv\Scripts\python.exe manage.py test core
  if ($LASTEXITCODE -ne 0) { throw 'Django tests failed' }
} finally { Pop-Location }
Push-Location "$root\frontend"
try {
  if (-not (Test-Path 'node_modules')) { Write-Host 'Installing frontend dependencies...'; npm install }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
Write-Host 'Checks passed. Review visual UI at http://localhost:5173/' -ForegroundColor Green

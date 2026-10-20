$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Push-Location "$Root\backend"
try {
    python -m pip install -r requirements.txt
    python manage.py check
    python manage.py makemigrations --check --dry-run
    python manage.py migrate
    python manage.py test core --verbosity 2
} finally { Pop-Location }
Push-Location "$Root\frontend"
try {
    npm install
    npm run build
} finally { Pop-Location }
Write-Host 'All Phase 1 runtime checks completed successfully.' -ForegroundColor Green

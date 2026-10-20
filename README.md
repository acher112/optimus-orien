# Optimus Orien — Public homepage + secure school setup increment

This is an **updated copy of the Phase 1 full-stack project**, not a replacement mockup. The original authenticated React dashboard and Django APIs are preserved.

**NEW:** Public `/` homepage, separate `/login` entry, privacy-only public indicators API, authorised six-step school setup, draft validation, activation, immutable version history, and related security tests.

Read [`docs/PUBLIC_HOME_AND_SCHOOL_SETUP.md`](docs/PUBLIC_HOME_AND_SCHOOL_SETUP.md) for exact PDF scope, route inventory, privacy and known limitations.

The PDF says the homepage **may** publish approved school-level data; it **does not** explicitly mandate public self-service registration. Schools are still created only by authorised org admins. Drafts and activation require an approved school administrator.

## Windows quick start

Open the extracted `optimus-orien` folder in VS Code. For a **new development database only**:

Backend terminal (PowerShell):

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item ..\.env.example ..\.env
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Frontend terminal (new terminal opened from the project root):

```powershell
cd frontend
npm install
npm run dev
```

- Public homepage: http://localhost:5173/
- Login: http://localhost:5173/login
- Authenticated dashboard: http://localhost:5173/app
- Setup: sign in → Schools → Configure (or sidebar School setup)
- Django API: http://127.0.0.1:8000/api/v1/

Demo credentials after running `seed_demo`: `admin` / `DemoPass123!`. Demo credentials are **unsafe for deployment**.

If you already used the earlier Phase 1 ZIP and it has a database, **back it up before migrations**, do not overwrite it with an older SQLite file, and do not run `seed_demo` against real data.

## Validation

```powershell
# Backend (from backend with activated .venv)
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test core

# Frontend (from frontend)
npm run build
```

See [`docs/LANDING_AND_SETUP_TEST_RESULTS.md`](docs/LANDING_AND_SETUP_TEST_RESULTS.md) for the honest checks performed in this environment, and the tests still to run locally.

## Continued development

The new configuration is an audited school-setup foundation only; the historical grade/attendance calculation engines, complete programme linkage, invitation activation, internationalisation, organisation defaults and full production readiness are **not complete**. See the earlier [`docs/REMAINING_REQUIREMENTS.md`](docs/REMAINING_REQUIREMENTS.md) plus the new scope document.

---

## Existing Phase 1 notes

# Optimus Orien
### School Performance Intelligence & Early Intervention Platform

A Phase 1 security-and-integrity update to the existing **starter implementation** informed by the accessible sections of the supplied 21-part project specification, built with **React 19 + TypeScript + Vite** and **Python Django + Django REST Framework**. Visual design includes responsive dashboards, role-aware navigation, a student directory, academic views, school reports, support cases, light/dark themes, charts, modals, filtering, CSV export, and empty/error states.

> **Honest status:** This is a development foundation with Phase 1 security code added, **not** a production-safe or fully tested A–Z implementation. Django runtime tests and migrations could not be executed during packaging because dependencies were unavailable. The current compliance map is explicitly partial; read `docs/PHASE1_ACCEPTANCE.md`, `docs/PHASE1_SECURITY_POLICY.md`, and `docs/REQUIREMENTS_MATRIX.csv` before using real data.

## Quick start (Windows PowerShell)

Requirements: Python 3.11+ and Node.js 20+.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example ..\.env
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

### 2. Frontend (another terminal)

```powershell
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173**. Demo user `admin` / `teacher` / `principal`, password: `DemoPass123!`.

### Linux/macOS

Use `python3 -m venv .venv`, `source .venv/bin/activate`, `cp ../.env.example ../.env`; remaining commands are identical.

### Before production

Change the demo passwords and secret key, set `DJANGO_DEBUG=false`, configure HTTPS / secure cookies and PostgreSQL, verify the committed migrations against a fresh database, reconcile any existing local migrations, complete guardian verification, add shared rate limiting and monitoring, and do a full security review. The demo seed command is only for local test databases.

## Architecture

```
React + TypeScript (Vite)
  |  /api/v1/  via same-origin Vite proxy (development)
  v
Django REST Framework -- sessions + CSRF + role/scoped querysets
  |                 |
  v                 v
SQLite (dev)    Django admin
PostgreSQL (prod recommended)
```

The API is the authority for calculations and access control. Demo metrics exclude unrecorded items rather than treating them as failures. Educational policies such as how late attendance contributes to presence must be configured and tested before production usage.

## Screens

- **Overview:** organisation dashboard, school metrics, support cases, recent students, school performance chart.
- **Students, Schools, Classes:** searchable directories and creation flows.
- **Academics, Attendance, Homework:** list/create records backed by Django.
- **Interventions:** support-case creation and monitoring.
- **Reports:** school/subject performance and attendance figures.
- **Notifications:** saved notification records.
- **Settings:** access profile and theme.

## API

`GET /api/health/`, `GET /api/v1/auth/csrf/`, `POST /api/v1/auth/login/`, `POST /api/v1/auth/logout/`, `GET /api/v1/auth/me/`, `GET /api/v1/dashboard/`, `GET /api/v1/reports/`, `GET /api/v1/exports/students.csv`.

All protected CRUD endpoints accept GET collection and detail, POST collection, PATCH/PUT detail, DELETE detail: `/api/v1/{schools,students,classes,subjects,years,enrollments,assessments,grades,attendance,homework,submissions,observations,cases,interventions,notifications}/`. Django REST Framework pagination uses `results`, `count`, `next`, and `previous`.

Session authentication requires the CSRF cookie/token on unsafe HTTP requests. The frontend handles login and CSRF. For cross-domain hosting, add a secure same-origin gateway or properly configured cookies rather than disabling CSRF.

## Tests

```powershell
cd backend
python manage.py test core
```

## Design notes

The UI includes custom CSS illustrations rather than external image dependencies. Web fonts are optional (system sans-serif fallback). Demo names and numbers are fabricated; **no production student data** is packaged.


## Phase 1 additions (October 2026)

The **React/TypeScript frontend is exactly the same as the previous ZIP** (source file hashes match): the UI has not been redesigned. The backend has been hardened incrementally without changing existing frontend API response shapes.

- Central deny-by-default `services/access.py` resource/action/tenant checks, plus foreign-key validation and model `full_clean()` before saves.
- Immutable historical key restrictions, enrolment date integrity, exclusive active enrolment constraint, and non-destructive, in-organisation transfer endpoint.
- `services/audit.py` scoped, privacy-minimised audit records and restricted read-only audit API.
- Created and committed `core/migrations/0001_initial.py`; this is a **fresh-database initial migration**, not a guaranteed in-place upgrade for old local databases.
- Positive/negative API tests for tenant isolation, roles, guardians, published grades, transaction rollback, grade validation and audit logging (written, not executable in the offline packaging environment).
- Stronger production configuration defaults for secure cookies, CSRF enforcement on login, basic login request throttle and HSTS.

**Documentation**: `docs/PHASE1_ARCHITECTURE.md` (diagram), `docs/PHASE1_SECURITY_POLICY.md` (policy/limitations), `docs/API_SECURITY_V1.md` (endpoint contracts), `docs/PHASE1_ACCEPTANCE.md` (testing), `docs/REQUIREMENTS_MATRIX.csv` (mapped source IDs), `docs/REMAINING_REQUIREMENTS.md` (remaining A–Z work), `docs/TEST_RESULTS.md` (honest execution results).

**New APIs:** `GET /api/v1/audit/` (read-only, scoped to permitted organisation/school) and `POST /api/v1/students/{id}/transfer/` with body `{"school_class": 4, "effective_date": "2026-10-25"}`. For normal CRUD, destructive DELETE is disallowed pending an approved retention policy.

**Windows setup warning**: use the `.env.example` development values only for local, fictional testing. If you previously created your own `core/migrations/0001_initial.py` or local database, do not overwrite your stored student data or fake-apply the new migration. Back up and reconcile schema history first.

**Execute verification after `pip install` and `npm install`**:

```
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test core -v 2
npm run build
```

Additional dependency-free source verification: `python scripts/verify_release.py` from the repository root. It checks code syntax and expected release files; it does not replace integration testing.

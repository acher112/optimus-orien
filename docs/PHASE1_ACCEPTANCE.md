# Phase 1 acceptance and evidence

| Requirement/test | Implementation evidence | Automated test/verification | State |
|---|---|---|---|
| API deny by default by role | `services/access.py` explicit matrices | `test_phase1.TenantAndRoleTests` | Coded; runtime tests not executed here |
| Tenant and student scope | `queryset_for()`, `validate_related()` | Other-org/school/assigned-class/parent tests | Coded; unverified at runtime |
| Immutable historical links | `IMMUTABLE_RELATIONS`, `Enrollment.clean` | Relationship and overlap tests | Coded; unverified at runtime |
| Audited atomic writes | `views.ScopedViewSet`, `services/audit.py` | Change minimisation, school audit visibility tests | Coded; unverified at runtime |
| Transactional school transfer | `views.transfer_student()` | Success, rejection and rollback tests | Coded; unverified at runtime |
| Schema versioning | `core/migrations/0001_initial.py` | `makemigrations --check --dry-run`, `migrate --check` to run | Migration authored; NOT executed |
| Model validation | `views.validate_model()`, model `clean()` | Invalid marks, subject/class and enrolment tests | Coded; unverified at runtime |
| Session login protection | CSRF decorator, login throttle, secure prod settings | CSRF client test | Coded; unverified at runtime |
| Role-based frontend | No changes to existing React/TypeScript JSX/CSS | SHA-256 file equality vs previous ZIP | Verified bytes identical |
| Archive integrity & Python syntax | Python `compileall`, ZIP CRC | Build script log | Verified |

## Suggested developer execution order

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item ..\.env.example ..\.env
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test core -v 2
python manage.py seed_demo
python manage.py runserver
```

Run a separate terminal:

```powershell
cd frontend
npm install
npm run build
npm run dev
```

**Migration warning**: This is a consolidated `0001_initial.py` schema for a fresh installation of the starter project. If you already created earlier migrations and populated a database from a previous ZIP, BACK UP THAT DATABASE; do not delete real data or fake-apply this new migration. A careful migration-reconciliation plan is required to upgrade existing databases. For a disposable demo database only, a fresh `db.sqlite3` can be initialized from scratch.

For CI: run `python manage.py makemigrations --check --dry-run`, `python manage.py migrate --noinput`, `python manage.py test core -v 2`, and `npm run build` against a clean sandbox with dependencies installed.

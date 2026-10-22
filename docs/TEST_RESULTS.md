> **SUPERSEDED (2026-10-22):** this record describes the 2026-10-19 static-only validation. Django tests, migrations and the frontend build have since been executed; see `OPTIMUS_ORIEN_TEST_RESULTS.md` for current results.

# Phase 1 validation record (2026-10-19)

## Actual environment outcomes

| Test | Status | What was actually verified |
|---|---|---|
| Python compilation / syntax (`python -m compileall`) | **PASS** | All bundled Python source code parses and compiles |
| Dependency-free source manifest (`scripts/verify_release.py`) | **PASS** | Key modules, tests, migration and documentation exist and parse |
| Model/migration CreateModel name comparison (AST) | **PASS** | 18 model names appear in committed initial migration; static check only |
| Model/migration explicitly declared field comparison (AST) | **PASS** | Declared fields have matching names in migration; static check only |
| React visual source preservation | **PASS** | All original frontend source/config files have identical bytes in the new release |
| Django tests (`python manage.py test core`) | **NOT RUN** | Django/DRF not installed; pip could not connect to package index |
| Django migration execution / `makemigrations --check` | **NOT RUN** | Same missing dependencies; `0001_initial.py` not validated in an actual Django environment |
| TypeScript/Vite build (`npm run build`) | **NOT RUN** | No installed node_modules and package-network access unavailable |
| Bare TypeScript `tsc -b` attempt | **BLOCKED** | Missing `react`, `react-dom`, `lucide-react`, `recharts` and JSX type definitions. These dependencies were absent from the environment; this was NOT a successful build |
| API, database, frontend end-to-end functional tests | **NOT RUN** | Requires Django dependencies, migrated DB, Node dependencies and a running app |
| ZIP CRC verification | **PASS after packaging** | See `TEST_RESULTS.json` or release notes |

**This release is a coded Phase 1 implementation awaiting integration validation**. It is not validated for deployment with real student data. Install project dependencies in a developer workstation/CI system, then run the listed migration, backend, and frontend commands. Any failures must be fixed before acceptance.

## Tests added (authored, not executed)

- Cross-organisation and within-organisation school restrictions
- Teacher class assignment and foreign-key manipulation attempts
- Student/parent isolation and review-case confidentiality
- Published grade lock and grade maximum validation
- Immutable historical relations and overlapping enrolment records
- Notification update restrictions and cross-user notification isolation
- Audit event privacy minimisation, scoped audit endpoint and API immutability
- Transactional transfer, rollback and record history preservation
- Anonymous API protection and CSRF-required login

Existing `backend/core/tests/test_security.py` is retained. New `backend/core/tests/test_phase1.py` extends it.

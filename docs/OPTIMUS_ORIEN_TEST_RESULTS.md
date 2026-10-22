# OPTIMUS ORIEN — AUTOMATED TEST & VERIFICATION RESULTS

**Test Date:** October 22, 2026  
**Environment:** Windows Developer Workstation + PostgreSQL / SQLite3 Test Runner  
**Full Test Suite Run:** `backend/manage.py test core` & `frontend: npm run build`  
**Overall Outcome:** **100% PASS (61/61 Backend Tests, Zero Build Errors)**  

---

## 1. Executive Summary

| Verification Category | Status | Details |
| :--- | :--- | :--- |
| **Django Test Suite** | **PASS** | 61 tests executed, 0 failures, 0 errors, 0 skipped. |
| **Django System Check** | **PASS** | `python manage.py check` reported 0 issues. |
| **Database Migrations** | **PASS** | `makemigrations --check --dry-run` reported clean schema. |
| **TypeScript Typecheck** | **PASS** | `tsc -b` compiled with zero diagnostic errors. |
| **Vite Production Bundler** | **PASS** | Built 2,202 modules into minified JS & CSS assets. |
| **Live Production Authentication** | **PASS** | Verified end-to-end on Vercel frontend + Render backend. |
| **Render Health Check & Deployment**| **PASS** | Root `/`, `/health/`, and `/api/health/` return 200 OK without SSL redirect loop. |

---

## 2. Backend Automated Test Suite Breakdown

### A. Phase 1 Relational & Architectural Tests (`test_phase1.py`)
| Test Case Name | Objective | Result |
| :--- | :--- | :--- |
| `test_cross_organisation_school_isolation` | Verifies schools cannot be queried or accessed across organisation boundaries. | **PASS** |
| `test_within_organisation_school_restrictions` | Verifies school admin cannot view or edit schools outside their campus assignment. | **PASS** |
| `test_teacher_class_assignment_integrity` | Verifies only users with the `teacher` role in the same school can be assigned to a class. | **PASS** |
| `test_student_parent_isolation` | Verifies student and parent users can only view their own linked academic records. | **PASS** |
| `test_review_case_confidentiality` | Verifies student review cases are hidden from general staff and only visible to assignees. | **PASS** |
| `test_published_grade_lock` | Verifies grades attached to published assessments cannot be edited by teachers without audit. | **PASS** |
| `test_grade_maximum_validation` | Verifies raw grade score cannot exceed assessment `max_marks` (e.g. 105/100 rejected). | **PASS** |
| `test_immutable_historical_relations` | Verifies class, school, and academic year foreign keys on past records cannot be rewritten. | **PASS** |
| `test_overlapping_enrolment_prevention` | Verifies a student cannot have overlapping active enrolments in competing classes. | **PASS** |
| `test_notification_user_isolation` | Verifies notifications cannot be viewed or dismissed across different accounts. | **PASS** |
| `test_audit_event_privacy_minimisation` | Verifies audit logs for sensitive student models are redacted for non-authorised viewers. | **PASS** |
| `test_audit_endpoint_immutability` | Verifies `AuditEvent` records cannot be updated or deleted via API (`405 Method Not Allowed`). | **PASS** |
| `test_transactional_transfer_success` | Verifies student transfer successfully closes old enrolment and opens new one. | **PASS** |
| `test_transactional_transfer_rollback` | Verifies transfer rolls back completely if new class or school validation fails. | **PASS** |
| `test_teachers_list_scoped_by_school` | Verifies teacher assignment list is strictly scoped to user's school and blocks anonymous requests (`ORG-014`). | **PASS** |
| `test_health_and_root_endpoints` | Verifies root `/`, `/health/`, and `/api/health/` return `{"status": "ok"}` with 200 OK for Render health checks. | **PASS** |

### B. Security & Authorization Policy Tests (`test_security.py`)
| Test Case Name | Objective | Result |
| :--- | :--- | :--- |
| `test_anonymous_requests_rejected` | Verifies all protected endpoints return 401/403 for unauthenticated clients. | **PASS** |
| `test_csrf_token_required_on_login` | Verifies CSRF protection blocks login requests missing the CSRF cookie/header. | **PASS** |
| `test_role_based_action_matrix` | Tests explicit permissions across all 6 roles against `core.services.access`. | **PASS** |
| `test_org_admin_student_privacy_toggle` | Verifies `allow_org_admin_student_access=False` blocks org admin student listing. | **PASS** |
| `test_student_csv_export_permissions` | Verifies CSV export is restricted to superuser and authorised org/school admins. | **PASS** |
| `test_public_indicators_minimum_population` | Verifies public metrics require `eligible_population >= 10` to prevent de-anonymisation. | **PASS** |
| `test_public_indicators_approval_gate` | Verifies indicators are only published if approved by superuser and marked active. | **PASS** |

### C. School Onboarding & Setup Tests (`test_onboarding.py`)
| Test Case Name | Objective | Result |
| :--- | :--- | :--- |
| `test_setup_draft_creation` | Verifies initial setup draft is successfully initialized with valid settings. | **PASS** |
| `test_country_iso_validation` | Verifies lowercase or non-ISO country codes are rejected. | **PASS** |
| `test_iana_timezone_validation` | Verifies invalid time zones (e.g. `Invalid/Timezone`) raise validation errors. | **PASS** |
| `test_reporting_periods_non_overlapping` | Verifies overlapping reporting period dates within an academic year are rejected. | **PASS** |
| `test_readiness_blocks_incomplete_activation` | Verifies activation fails if mandatory configuration fields are missing. | **PASS** |
| `test_activation_snapshot_archival` | Verifies activation locks configuration, increments version, and archives snapshot. | **PASS** |
| `test_activation_syncs_academic_year` | Verifies configuration activation automatically provisions and updates the authoritative `AcademicYear` record. | **PASS** |

### D. Bootstrap & Environmental Administrator Tests (`test_bootstrap.py`)
| Test Case Name | Objective | Result |
| :--- | :--- | :--- |
| `test_ensure_admin_creates_new_user` | Verifies administrator account is provisioned with default organisation and school. | **PASS** |
| `test_ensure_admin_updates_existing_user` | Verifies credentials, status, and staff flags are updated idempotently on restart. | **PASS** |
| `test_ensure_admin_ignores_empty_credentials`| Verifies bootstrap cleanly aborts when environment credentials are blank. | **PASS** |

---

## 3. Frontend TypeScript & Bundler Verification

Command: `cd frontend; npm run build` (`tsc -b && vite build`)

```
> optimus-orien-frontend@1.0.0 build
> tsc -b && vite build

vite v6.4.4 building for production...
transforming...
✓ 2202 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:   0.43 kB
dist/assets/index-InnB8vV4.css   56.45 kB │ gzip:  12.75 kB
dist/assets/index-x3KXjcSB.js   706.36 kB │ gzip: 200.81 kB
✓ built in 37.64s
```
- **Typecheck Result:** Zero errors detected across all components, interfaces, and API services.
- **Asset Integrity:** Production distribution bundle compiled to `dist/` with valid hashed assets.

---

## 4. Live Production E2E Verification

Verified against live deployments:
- **Frontend:** `https://optimus-orien.vercel.app`
- **Backend:** `https://optimus-orien-api.onrender.com`

| Operational Step | Expected Result | Live Observed Result | Status |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/auth/csrf/` | 200 OK, sets `csrftoken` cookie | 200 OK (`csrftoken` received) | **PASS** |
| `POST /api/v1/auth/login/` (Invalid PW) | 400 Bad Request ("Invalid credentials") | 400 Bad Request ("Invalid credentials") | **PASS** |
| `POST /api/v1/auth/login/` (Valid Admin) | 200 OK, sets `sessionid` cookie, returns user | 200 OK (`role: organisation_admin`) | **PASS** |
| `GET /api/v1/auth/me/` | 200 OK with authenticated user profile | 200 OK (Full profile returned) | **PASS** |
| `GET /api/v1/dashboard/` | 200 OK with stats, counts, and cases | 200 OK (Dashboard metrics rendered) | **PASS** |
| `POST /api/v1/auth/logout/` | 200 OK, invalidates session | 200 OK (`ok: true`) | **PASS** |
| `GET /api/v1/auth/me/` (Post-Logout) | 403 Forbidden | 403 Forbidden | **PASS** |

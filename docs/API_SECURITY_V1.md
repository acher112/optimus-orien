# API v1 contract and scope

API remains `/api/v1/` with all existing React endpoints preserved. Auth: secure server-side Django session cookie and CSRF token. Return status 403 on authenticated action denial, 404 for not-found/hidden object, and 400 for invalid or inconsistent input. Standard REST framework pagination: `count`, `results`, `next`, `previous`. `POST`, `PATCH`, `PUT` operations are atomic and protected by action+related-object authorisation.

## Added endpoints

### `POST /api/v1/students/{student_id}/transfer/`
Requires organisation administrator (cross-school, within organisation) or school principal/administrator (within school). Request:

```json
{"school_class": 42, "effective_date": "2026-10-25"}
```

Successful `201`:

```json
{"student": 15, "school": 4, "school_class": 42, "effective_date": "2026-10-25"}
```

Effects: closes existing open enrolment at the previous calendar date, updates current student school, adds new enrolment, audits event. Validates destination academic-year range, start dates, scope and organisation. Historical grades, attendance and private review cases retain their original associations and school scopes. **Requires a current active enrolment for full expected history**; staff should investigate inconsistent legacy records.

### `GET /api/v1/audit/`
Principal/school administrator: audit events at their school; organisation administrator: events in their organisation; superuser: all. Read-only; audit `POST/PATCH/DELETE` unavailable. Sensitive free-text values intentionally not included in changes. Responses contain safe metadata and field names, not complete student change history.

## Deliberate API restrictions

* Direct `DELETE` to core educational resources is disabled (403) pending retention rules.
* Parents/students cannot write protected academic resources; only their notification `read` flag is writable.
* `Student.school` is immutable via generic PATCH; use transfer action.
* Grade assessment/student links, attendance class/date/student, enrolment student/class/start, and other historical relationships are immutable via generic PATCH.
* User-controlled actor fields (`created_by`, `confirmed_by`, `teacher` for observations) are assigned server-side.
* Grades associated with `Assessment.published=true` cannot be created or changed by teachers.
* Case and intervention details are denied to student and parent roles; teacher case access requires assignment.

## Still unsupported

Delegated account creation, invitation/password reset, multi-class concurrent enrolment, guardian verification, formal grade correction approval, period-based calculations and granular per-subject teacher assignments. API documentation is a draft contract, not an externally audited stable version.

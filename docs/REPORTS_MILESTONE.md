# Milestone 2.5 — Reports & Drill-Down Analytics

Added 2026-10-22 after client testing. The client expects an organisation administrator to see **all campuses**, and within a campus to see **all classes together, a single class, all subjects in a class, or a single subject**. Spec basis: Part 6 §11.3 (drill-down), Part 13.2 (class performance), Part 15 §8–10 (report categories, denominators, averages), TDB-014/016/017, VIS-021/022.

## What was built

| Level | Endpoint | Shows |
|---|---|---|
| Organisation | `GET /api/v1/reports/overview/?period=` (also `GET /reports/`) | Campus comparison, subjects grouped by code with per-campus breakdown |
| Campus | `GET /api/v1/reports/campus/<school_id>/?period=` | All classes side by side, subjects across all classes, comparability flags |
| Class | `GET /api/v1/reports/class/<class_id>/?period=` | All subjects in one class (average, min–max, valid/eligible, missing, distribution), attendance, student rows (if permitted) |
| Subject | `GET /api/v1/reports/campus/<school_id>/subject/<code>/?class=&period=` | One subject across classes or in one class, assessment-level detail, distribution, student results (if permitted) |

Frontend: `frontend/src/Reports.tsx` (breadcrumb **All campuses › Campus › Class › Subject**, persistent reporting-period selector, calculation-transparency panel). A principal/school admin with a single campus starts directly at their campus.

## Calculation policy (shown on screen and returned in every response as `method`)

* Published assessments only.
* Student subject result = weighted average (by assessment weight) of that student's percentages.
* Subject/class/campus/organisation average = simple average of student results (never raw marks, never an average of averages).
* Overall = simple mean of a student's subject results (no subject weighting is configured yet).
* Missing results are **counted and reported, never zero**. Eligible = enrolled in the class on the assessment date.
* Attendance = (present + late) / all recorded sessions (same as the dashboard).
* Period comes from each school's `SchoolConfiguration.reporting_periods`; a campus without that period is listed as unavailable and excluded.
* Classes whose assessment structure (count, weights, max marks) differs for a subject are flagged **not directly comparable** (TDB-016).

## Access rules

* Organisation admin: all campuses of their organisation. Aggregates do **not** depend on `allow_org_admin_student_access`; identifiable student rows do.
* School admin / principal: own campus only. Teacher: own classes only. Student / parent: no aggregate reports (403).
* Every level re-checks scope server-side; out-of-scope ids return 404.

## Defects in the previous Reports page that this replaces

1. No campus / class / subject / period filters.
2. Subject list was per campus with no label, producing duplicate "Mathematics" bars for multi-campus admins.
3. Organisation admins could receive empty reports when the student-privacy flag was off.
4. Average was taken over raw grade records and ignored assessment weight.
5. Python loops per subject (N+1 queries).

## Tests

`backend/core/tests/test_reports.py` — 21 tests: anonymous/student/parent blocked; org admin vs principal vs teacher scope at every endpoint; cross-organisation and cross-campus id guessing; weighted-average maths; missing ≠ zero; unpublished ignored; late joiners not counted missing; distribution; comparability flag; attendance denominator; period filtering and unconfigured campus handling.

## Demo data

`python manage.py seed_demo` now also populates Westbridge School (2 classes, 16 students, 3 subjects, grades, attendance, one genuinely missing result, Grade 9 Mathematics with a different weight so the comparability flag is visible) and Term 1 / Term 2 reporting periods for both campuses. Extra logins (password `DemoPass123!`): `teacher_west`, `principal_west`.

## Known limitations (not yet implemented)

* No assignment-completion, participation/skill, intervention or organisation-health report categories (Part 15 §8.4–8.8).
* No report export (PDF/CSV) of the new views.
* No cross-period trend comparison; one period at a time.
* Calculation policy is fixed in code; school-configurable grading/attendance rules are a later milestone.

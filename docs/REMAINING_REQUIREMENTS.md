# Remaining work — not yet an A-to-Z production system

**Source coverage limitation:** Only excerpts of the 21-part Optimus Orien PDF were available via indexed file retrieval. `REQUIREMENTS_MATRIX.csv` lists **verified visible identifiers**, not an exhaustive line-by-line extraction. Other IDs and acceptance criteria MUST be mapped from the original PDF before final acceptance.

## Next modules (Phase 2–10)

1. Organisation/campus management, programmes, reporting periods, country/language/RTL configuration, academic-year transition, multiple teacher assignments, historical teacher/subject allocations and cross-school transfer access policy.
2. Account invitations, delegated staff/user administration, permissions/guardian approvals, verified consent/revocation, password reset, MFA, suspension and session revocation, security event monitoring.
3. Assessment grading configuration/version snapshots, weighted averages, grading scale/rubrics, publication/moderation, reviewed corrections and grade history.
4. Enrolment-aware attendance expected-session denominator, holiday/calendar exclusions, legitimate absence/late policy, register completeness and bulk classroom UI.
5. Homework confirmation workflows, student submission UI, due dates, cancellations, overdue states, multiple submissions and completion metrics.
6. Configurable participation and subject-linked skills, rubric versioning, observation provenance and appropriate reporting.
7. Student/teacher/principal/organisation dashboards with period filters, completeness indicators, school comparisons that respect non-equivalent grading rules and historical charts.
8. Transparent configurable indicator and review rules, versioned source evidence, cases, intervention action lifecycle, reassessment and follow-up effects (not predictive/diagnostic AI).
9. Export/report templates (including PDF), permission-aware CSV/Excel and scheduling, approved disclosure controls and alert/notification rules; background jobs and retries.
10. Production readiness: PostgreSQL integration tests, CI, browser E2E, WCAG tests, penetration test, reliable shared rate limit, HTTPS/reverse proxy, backups/restores, retention/erasure policies, staging, alerting and monitoring.

## Phase 1 caveats

- Existing React design was deliberately not replaced. This release improves backend safety; it does **not** introduce new polished frontend portals.
- The initial migration is designed for a *fresh* database. Existing locally generated migrations must be reconciled carefully, not overwritten over live records.
- Django dependencies cannot be installed in the package-building environment, so runtime tests have NOT been executed; this is a significant release blocker for real-world deployment.
- Permission matrices are initial, conservative decisions informed by the visible spec; each school and jurisdiction's policies must be reviewed.
- Grade and attendance summary formulas remain basic demonstration computations; configured calculation services are future work.
- Django admin remains a privileged interface and cannot substitute for a complete approved user provisioning, historical deletion or audit governance system.

Read `PHASE1_SECURITY_POLICY.md`, `PHASE1_ACCEPTANCE.md` and `API_SECURITY_V1.md` before building the next phase.

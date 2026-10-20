> **Phase 1 update:** For current coverage read `PHASE1_ACCEPTANCE.md` and `REQUIREMENTS_MATRIX.csv`. This starter overview predates the security updates.

# Optimus Orien – delivery coverage (original starter)

## Source and limits

The uploaded specification describes Optimus Orien as a **School Performance Intelligence and Early Intervention Platform**. It includes (among others) product foundations, organisational data, six core roles, assessment/grade calculations, attendance, homework, participation/skills, dashboards, rules-based indicators, intervention cases, reporting, notifications, educational configuration, and technical architecture. PDF retrieval was only partially available in this session, so this file **does not claim a line-by-line audit of every acceptance criterion**.

| Area | Implemented here | Remaining for production |
| --- | --- | --- |
| Design system | Responsive custom dashboard, charts, side navigation, login, skeleton/empty/error states, dark theme, forms | Full WCAG accessibility audit, design QA across browsers |
| Authentication | Django session login/logout, CSRF, password validators | MFA, reset/invitation workflows, session management policies |
| Roles | Six role identifiers, server-side school/org/student scopes | Fine-grained permission matrix and object permissions for every relationship; granular parent consent |
| Organisation hierarchy | Organisation, schools, academic years, classes, subjects, teachers, students, guardians, historical enrolments | Multiple concurrent teacher subject assignments, campus layer, bulk transfers |
| Academic assessment | Weighted field, mark validation, publication flag, persistent grades | Configurable grading rule engine, weighting calculations, moderation and locking workflows |
| Attendance | Session records, statuses, scoped access, recorded-session rate | Holiday/calendar engine, expected-session completeness, approved denominator policy, bulk register UI |
| Homework | Assignments, submissions, verification model, statuses | Full submission/confirmation portal, due/eligibility rules and completion analytics |
| Participation & skills | 1–10 rated subject observations model/API | Configurable rubrics/scale versioning, dedicated UI |
| Support | Review cases, priorities, statuses, intervention model | Automated configurable rules engine, review audit lifecycle, follow-up outcome charts |
| Reporting | Scoped subject metrics, school overviews, CSV student export | Export templates/PDFs, snapshots, asynchronous jobs, period filtering, comparability controls |
| Notifications | Scoped notification storage/API, simple UI | Notification preference rules, secure email/SMS delivery, background queues |
| Data integrity | Foreign keys, uniqueness checks, model validation and transaction-based seeding | Stored migrations, database-level cross-tenant invariants, versioned change history, wider test suite |
| Operations | `.env.example`, health endpoint, documentation | Docker/CI, structured monitoring, queues, storage, staging, backup restore exercises |

## Important security caveats

- This is a development-oriented foundation. **Do not host real student data** without a deeper authorization/security review.
- Writable endpoints require significantly stricter checks for mutable relations (including joins via assessment, homework, year, subject and case). These must be exhaustively tested per role.
- No automatic early-warning claims are fabricated. Review cases must be interpreted by qualified staff.
- Homework is not automatically marked verified upon student submission.
- Published assessment averages only include grades that exist, so missing grades are excluded rather than silently scored zero.

## Recommended next engineering phases

1. Implement and test the formal role/action/scope matrix from the PDF, with field-level policies.
2. Add schema migrations and automated testing for every cross-school association.
3. Develop enrolment-aware attendance completeness, term calendars and configurable educational rules.
4. Implement assessment period weighting, grade histories, locking and audit workflows.
5. Build the entire indicator-to-review-to-intervention lifecycle with transparent policies and follow-ups.
6. Add student/guardian portals, actionable teacher-gradebook workflows, configurable reports and quality audits.
7. Production hardening: MFA, secrets, PostgreSQL, CI/CD, backup restoration, monitoring and compliance checks.

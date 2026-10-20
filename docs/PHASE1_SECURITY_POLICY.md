# Phase 1 server-side authorisation & data integrity policy

This is the **initial, conservative application policy** derived from the accessible sections of the Optimus Orien specification (especially Parts 4–5, 18 and 20). It is NOT a claim that all privacy, security or operational acceptance tests in the PDF are complete.

## Scope composition

A request must pass **both** (1) an explicit role/resource/action grant and (2) a record/relation scope check. The frontend is not the security boundary. `backend/core/services/access.py` is the canonical source for current policy.

* Organisation administrator: school-level access across assigned organisation. **Identifiable student access defaults OFF**, enabled only when the organisation's `allow_org_admin_student_access` flag is explicitly configured. The fictional seed enables this for demo experience only.
* School administrator and principal: assigned school. Principal cannot directly edit school-level settings in Phase 1; both may create academic records and review cases within school.
* Teacher: classes currently assigned to that teacher. Reads of student records require current class enrolment. Teacher writes: assessment, grades, attendance, homework, submissions, observations, and creation (not edit) of review cases and intervention actions. Teacher cannot edit published grades or transfer pupils. Teacher access to case details requires explicit assignment as case assignee.
* Student: own student record and permitted linked academic information only; review cases, interventions, observations and audit events denied.
* Parent/guardian: only explicitly linked student records and academic information. Review cases, interventions, observations and audit events denied. Parent has no writes except marking *their own* notifications as read.
* Superuser: cross-tenant application API access, but no destructive deletion; Django administration is limited to superusers for built-in record/user management.

### Allowed create/update resources (simplified)

| Role | Academic configuration / students | Assessments / marks / attendance / homework | Cases / actions | Schools | Audit log |
| --- | --- | --- | --- | --- | --- |
| Organisation administrator | Write in organisation when identifiable-student policy enabled | Write in scope | Write in scope | Create/update | Read in organisation |
| School administrator | Write within school | Write in school | Write in school | Update assigned school | Read in school |
| Principal | Write within school | Write in school | Write in school | Read only | Read in school |
| Teacher | Read assigned classes/students only | Write assigned-class records, published grades locked | Create only, assigned case access | Read | Denied |
| Student | Read own records | Read own recorded items | Denied | Read school | Denied |
| Parent | Read linked children | Read linked children's records | Denied | Read linked school | Denied |

All delete requests return 403, including superuser API requests. Archival, erasure, retention approvals and statutory compliance need a dedicated design, tests and sign-off. No role is automatically allowed to delete academic history.

## Integrity controls added

* New enrolments validate admission date and reject overlapping periods. The DB has a partial uniqueness constraint on the sole open-ended enrolment per student, plus the natural uniqueness constraint for duplicate class/start combinations.
* A transactional `POST /api/v1/students/{id}/transfer/` closes an active enrollment and creates a new one without modifying historical grades or attendance. Existing review cases retain their original school scope; transfer does not expose private old-school case details to the new school.
* Assessments, grades, attendance records, observations, homework submissions and staff/case relationships validate their references on writes. All submitted writable FKs are checked against the user's relation scope and immutable historical links cannot be silently repointed.
* Django `full_clean()` and database uniqueness/foreign-key constraints work together. Cross-table conditions (for example, subject must belong to class school) are validated at the service/model layer; **SQLite/PostgreSQL cannot enforce every cross-table relationship with a basic CHECK constraint**. Bypassing the API with raw SQL/admin/other privileged code may still violate some model-level invariants.
* AuditEvent records actor, timestamp, organisation, school, resource and safe field names. A limited allowlist of state changes is retained; actual marks, names, feedback, DOB, free-text notes, passwords and access tokens are deliberately not stored in audit differences. API deletion of audit events is prohibited; application admins cannot edit audit records through standard admin controls.
* Session authentication plus CSRF; login CSRF enforced even before authentication. Basic IP-scoped login throttling is applied. Production cookie security and HSTS enabled when `DJANGO_DEBUG=false`.

## Remaining security limitations to address before real deployment

1. Guardian relationship creation uses a basic organisation/parent-role check; **verified consent, custody restrictions, revocation workflow and relationship audit** are unfinished.
2. Teacher assignments are stored in a current `SchoolClass.teacher` FK; historical assignment periods and subject-by-teacher permissions need explicit models/logic. Teacher reassignment currently relies on AuditEvent field history, not a full assignment history table.
3. Cross-school transfers are limited to a single organisation. Past-school staff are not guaranteed an authorised historical-view workflow once a student transfers; reports need scoped historical snapshots.
4. Users are provisioned by superuser in Django admin; invitation, account suspension UI, MFA, password reset, session revocation, delegated role policy and reauthentication for high-risk actions are not implemented.
5. No cryptographic append-only audit store, independent logging sink, backup/restore drill or retention service yet. Django superusers and DBAs are trusted operators.
6. Audit changes record only allowlisted values, not enough for complete grade correction approval or independent evidence of every record state. Structured grade history remains pending.
7. School curricula, grading versions, permissions settings and per-school data-sharing rules are not fully configurable.
8. Rate throttling is a basic per-process DRF cache-backed measure; distributed deployment needs shared caching and proxy-aware rate limits.
9. Production HTTPS, WAF, log analysis, external penetration test and privacy-by-jurisdiction review are not verified.
10. No complete browser/React integration testing or real-data test was possible in the delivery environment.

Do not use demo credentials with live student records. No `ALLOWED_HOSTS='*'`, weak production secret, public database, or disabled CSRF should be used.

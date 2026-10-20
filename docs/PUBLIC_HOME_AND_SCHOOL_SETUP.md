# Public homepage and authorised school setup — source alignment

This increment extends the existing Phase 1 ZIP rather than replacing the school intelligence application.

## Requirements from the uploaded OPTIMUS ORIEN.pdf

| Source | Source says | Implemented | Limits |
|---|---|---|---|
| Part 5 §16; student dashboard §10.6 | A **public homepage may** publish expressly approved school-level metrics and leaderboards. Never individual student data. | Public React homepage; safe GET API only exposes explicitly approved aggregate `PublishedSchoolIndicator` records. Default is **nothing published**. | No school leaderboard generated; comparability/eligibility needs a configured publication rule. |
| Part 5 §16 | Published indicators need method, period, eligibility and completeness. | Published record requires period, methodology, eligible population, completeness note; public cards show those. | The initial safety threshold of 10 is a conservative implementation choice, NOT a threshold specified in the PDF and not jurisdictional legal advice. |
| Part 5 §18; AUTH-014/015 | Staff, parent and student accounts use controlled invitations; no automatic role grant on public sign-up. | Private workspace remains protected; public homepage links to existing login, not unrestricted registration. | Secure invitations and account activation are NOT implemented. |
| Part 2 ORG-001/002; Part 5 org admin | Organisation-scoped school creation and management. | Retains existing organisation-admin `POST /api/v1/schools/` behind authenticated authorization. | Platform-wide customer organisation provisioning still requires authorised operations. |
| Part 19 SCH-001/002 | Per-school educational settings; separate organisation defaults. | School-scoped configuration record; no guessed country-specific settings. | Organisation-level default resolver and policy precedence still outstanding. |
| Part 19 SCH-003 | More than one education programme per school. | Multi-programme setup field accepts explicit school-programme names. | No full programme entity / assessment-programme linkage yet. |
| Part 19 SCH-004 | Setup wizard: country, school/organisation identity, time zone, language and locale, programme(s), calendar, periods, grading, attendance and specific settings. Review and correct before activation. | Six-step authenticated React wizard; complete server validation; partial draft saves; administrator-only activation. | Settings collection is functional but full downstream calculation integration is pending. |
| Part 19 SCH-005 | Explain missing/invalid configuration; do not substitute fake defaults. | `readiness.issues` per-field; activation returns HTTP 400 if invalid. | Config readiness should later gate every dependent operation. |
| Part 19 SCH-006; ARCH-006 | Preserve past meaning and audit significant changes. | Immutable `SchoolConfigurationVersion` activation snapshots + audit events. Editing an active config returns it to draft. | Automatic impact-analysis of changed policies and recomputation not built. |

**Not stated as a firm requirement:** anonymous/public self-service school signup, automatic approval, pricing, billing, demo booking, marketing testimonials, external enquiry forms. These were deliberately **not invented or presented as working features**.

The public homepage's marketing copy and illustrative (clearly labelled) interface graphic are presentation choices. There are **no fabricated school metrics**, student names or school rankings.

## Working flow

1. Open `/` for the public homepage. It is accessible without login.
2. Click **Sign in** and enter the existing authorised account.
3. An organisation admin creates a school in **Schools** (existing API); a school admin can manage an assigned existing school.
4. Click **Configure** on a school row or **School setup** in workspace navigation.
5. Select an authorised school and complete six steps. The system saves **drafts** only on Save draft.
6. Open Review, correct validation issues, **save the draft**, then activate. Activation cannot proceed on incomplete or conflicting settings and records an immutable version and audit event.
7. After any later change, the active configuration status goes back to draft. Previous version snapshots remain intact; reactivation creates a new version.
8. A platform superuser may deliberately approve aggregate metrics under `/admin/` → Published school indicators. Each public approval needs a real method, period, eligible population, completeness note, approving platform administrator, and publication date. Metrics are otherwise private. There is no student-level public API.

## Route inventory

| Method | URL | Access |
|---|---|---|
| GET | `/` | Public frontend homepage |
| GET | `/login` | Public frontend login |
| GET | `/app` | Authenticated frontend dashboard |
| GET | `/api/v1/public/indicators/` | Anonymous/public; explicitly approved school aggregates only |
| GET | `/api/v1/schools/{id}/setup/` | Authenticated + within authorised school scope |
| PATCH | `/api/v1/schools/{id}/setup/` | Organisation admin of school / assigned school admin / platform superuser |
| POST | `/api/v1/schools/{id}/setup/activate/` | Same management scope; only complete draft |
| POST | `/api/v1/schools/` | Existing authorised organisation admin API; no public school creation |

Protected write endpoints use Django session authentication + CSRF. All server-side school filters use the existing Phase 1 `schools_scope` policy. Client-side navigation does not create permissions.

## School setup policy shape

```json
{
  "country": "PK", "jurisdiction": "Sindh",
  "timezone": "Asia/Karachi", "language": "en", "locale": "en-PK",
  "programmes": ["National curriculum", "Cambridge IGCSE"],
  "academic_year_name": "2026-2027",
  "academic_start": "2026-08-01", "academic_end": "2027-06-30",
  "reporting_periods": [{"name": "Term 1", "start": "2026-08-01", "end": "2026-12-20"}],
  "grading_policy": {"approach":"custom", "description":"School-approved grading, weight and missing-result rules"},
  "attendance_policy": {"recording_basis":"daily", "description":"Eligible recorded sessions and status handling"},
  "school_settings": {}
}
```

This is an **example** to demonstrate the payload shape; its academic and calculation values are not mandated defaults. The backend deliberately does not assume any default grade thresholds, attendance handling, academic term dates or supported national framework.

## Known limitations that must not be concealed

- The **existing** grade, attendance, report and dashboard calculation services are not yet wired into these new setup policies. Do not advertise full configured grading or locale compliance until integrated and tested.
- Invitation-based provisioning of staff/parents and customer organisation onboarding is unfinished.
- School configuration data is not yet a comprehensive versioned, precedence-aware configuration engine.
- There is no real performance leaderboard, ranking engine or public publication audit independent of superuser admin; public metrics are manually entered and require verified sources before use.
- The current demo accounts and test data must not be used in production; true authentication/session hardening, audit policy, country registry, privacy/legal checks, background jobs, tenant-scoped reporting and deployment/monitoring remain outstanding.

## Testing

New `backend/core/tests/test_onboarding.py` exercises anonymous access, tenant boundaries, limited school roles, validation failures, safe activation, historical versioning, mass assignment rejection, publication privacy and small-group suppression.

Run `python manage.py migrate && python manage.py test core` in backend and `npm run build` in frontend after dependencies are installed. At authoring time the execution container lacked both Django packages and npm package cache; source compile checks are not a substitute for end-to-end tests. See `docs/LANDING_AND_SETUP_TEST_RESULTS.md`.

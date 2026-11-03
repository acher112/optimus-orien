# Psychological Evaluation Module — Role Permission Matrix

This document defines the strict server-side authorization model and capability keys for the Psychological Evaluation Module in Optimus Orien.

---

## 1. Capability Keys

| Capability Key | Description |
| :--- | :--- |
| `psych_eval.submit` | Ability to create and submit weekly student evaluations. |
| `psych_eval.view_own_submissions` | Ability to view evaluations submitted by the current user. |
| `psych_eval.view_class` | Ability to view evaluations and developmental profiles for students in assigned class/section. |
| `psych_eval.view_campus` | Ability to view evaluations, class aggregates, and student profiles across an entire campus. |
| `psych_eval.view_school` | Ability to view evaluations, campus comparisons, and profiles across all campuses of an organisation. |
| `psych_eval.view_aggregates` | Ability to view statistical aggregates and completion rates (enforcing the minimum cohort size rule >= 5). |
| `psych_eval.publish` | Ability to publish or unpublish weekly profiles to student view. |
| `psych_eval.amend` | Ability to record an authorized revision/amendment to a submitted evaluation. |
| `psych_eval.export` | Ability to generate CSV exports of evaluations (audited, restricted). |
| `psych_eval.manage_settings` | Ability to enable/disable module, set week start day, minimum cohort size, retention period, and publisher roles. |
| `psych_eval.view_audit` | Ability to inspect the evaluation audit log. |
| `psych_eval.referral.create` | Ability to submit a confidential safeguarding referral. |
| `psych_eval.referral.view` | Ability to view and triage safeguarding referrals (restricted to designated safeguarding personnel). |

---

## 2. Role-by-Role Permission Matrix

### What Each Role Can See and Change

| Role | Scope | Can See | Can Change / Act | Prohibited |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Admin** (`platform_admin` / superuser) | System-wide (Cross-tenant) | Aggregate statistics across schools (completion rates, counts, anonymised averages with cohort size >= 5). | Cannot modify evaluations. Can initiate audited, time-limited break-glass session with owner approval. | Cannot view student names or individual evaluations during normal operations. |
| **Organisation Admin / School Owner** (`organisation_admin`, `owner`) | All campuses of their own organisation | All evaluations, dashboards (L1, L2, L3, L4), audit logs, settings, and aggregate trends across all campuses. | Can configure school settings, publish/unpublish evaluations, approve amendments, export data, configure safeguarding leads. | Cannot access other organisations' data. |
| **School Principal** (`principal`, `school_admin`) | Assigned campus only | All evaluations, classes, teachers, student profiles (L2, L3, L4), and campus-level trends within assigned campus. | Can publish/unpublish evaluations for campus students, view audit logs for campus, submit safeguarding referrals. | Cannot view or modify records from any other school or campus. |
| **Class Teacher** (`teacher` with `ClassTeacherAssignment`) | Assigned class & section | Evaluations and development profiles of students enrolled in assigned class. Class-level summaries (L3). | Can submit weekly evaluations for assigned students, save drafts, request amendments, publish (if configured). | Cannot evaluate or view students outside assigned class. Cannot view confidential safeguarding notes unless designated lead. |
| **Subject Teacher** (`teacher` with `TeachingAssignment`) | Assigned class & subject | Their own submitted evaluations. Relevant student profile ONLY if school setting `subject_teachers_can_view_combined_profile` is enabled. | Can submit subject-specific evaluations for students in assigned class/subject. Save drafts. Request amendments. | Cannot evaluate students outside assigned subject/class. Cannot publish profiles. Cannot view class teacher general notes. |
| **Unassigned Teacher** (`teacher` without active assignments) | None | Workspace displays "No assigned classes or subjects". | None. | Cannot evaluate any student or view any evaluations. |
| **Student** (`student`) | Self only | Own **published** weekly profile (radar chart, 6 dimensions, historical trend line, approved constructive feedback). | Cannot edit anything. | Cannot view unpublished evaluations, item-level responses, teacher notes, teacher identities, referrals, flags, or peers. |
| **Parent / Guardian** (`parent`) | None (v1) | No access in Version 1.0 specification. | None. | Completely excluded in Version 1.0. |
| **Accountant** (`accountant`) | None | No access. | None. | Completely excluded. |
| **Designated Safeguarding Lead** (Designated user) | Assigned campus / school | Confidential safeguarding referrals submitted by teachers. | Triage referrals, update status (`under_review`, `action_taken`, `closed`), record lead notes. | Scoring engine and radar charts are never used as risk detectors. |

---

## 3. Capability Mapping by Role

| Capability | Platform Admin | Org Admin / Owner | Principal | Class Teacher | Subject Teacher | Student | Safeguarding Lead |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `psych_eval.submit` | ❌ | ❌ | ❌ | ✅ (Assigned Class) | ✅ (Assigned Subject) | ❌ | ❌ |
| `psych_eval.view_own_submissions` | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `psych_eval.view_class` | ❌ | ✅ | ✅ | ✅ (Assigned Class) | ❌ (Unless setting enabled) | ❌ | ❌ |
| `psych_eval.view_campus` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `psych_eval.view_school` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `psych_eval.view_aggregates` | ✅ (Anonymised) | ✅ | ✅ | ✅ (Class) | ❌ | ❌ | ❌ |
| `psych_eval.publish` | ❌ | ✅ | ✅ | Optional (Configurable) | ❌ | ❌ | ❌ |
| `psych_eval.amend` | ❌ | ✅ (Approve) | ✅ (Approve) | ✅ (Request/Submit) | ✅ (Request/Submit) | ❌ | ❌ |
| `psych_eval.export` | ❌ | ✅ (Audited) | ✅ (Audited) | ❌ | ❌ | ❌ | ❌ |
| `psych_eval.manage_settings` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `psych_eval.view_audit` | ❌ | ✅ | ✅ (Campus) | ❌ | ❌ | ❌ | ❌ |
| `psych_eval.referral.create` | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `psych_eval.referral.view` | ❌ | ✅ (If Designated) | ✅ (If Designated) | ❌ | ❌ | ❌ | ✅ |

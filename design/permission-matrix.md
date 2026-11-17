# Role Permission & Capability Matrix

This document defines the strict server-side authorization model and capability keys for **Record** and **Teacher Performance** modules in Optimus Orien, along with the parity mappings across platform roles.

---

## 1. Capability Keys

| Capability Key | Module | Description | Default Roles Granted |
| :--- | :--- | :--- | :--- |
| `records.view_staff` | Record | View staff directory, employment history, and lifecycle transitions. | `owner`, `organisation_admin`, `principal` |
| `records.view_students` | Record | View student admissions, enrollments, promotions, graduations, and departures. | `owner`, `organisation_admin`, `principal` |
| `records.view_fees` | Record | View billing registers, collection breakdowns, fee categories, and defaulters. | `owner`, `organisation_admin`, `principal`, `accountant` |
| `records.view_finance` | Record | View categorized income and expenses, net balances, and cash/bank receipts. | `owner`, `organisation_admin`, `principal`, `accountant` |
| `records.view_salaries` | Record | View campus salary disbursement totals and monthly payroll registers. | `owner`, `organisation_admin`, `principal` (Totals only) |
| `records.view_salary_lines` | Record | View individual staff salary compensation lines (gross, deductions, net). | `owner`, `organisation_admin` (Principal optional) |
| `records.view_terminated_notes` | Record | View confidential termination rationale and disciplinary notes. | `owner`, `organisation_admin` strictly |
| `records.manage` | Record | Manually record past lifecycle events or void existing entries with mandatory justification. | `owner`, `organisation_admin`, `principal` |
| `records.export` | Record | Download formula-sanitized dual-sheet Excel (.xlsx) workbooks. | `owner`, `organisation_admin`, `principal`, `accountant` (fees/finance) |
| `teacher_performance.view_summary` | Teacher Performance | View teacher performance overview, benchmark distribution, and campus rankings. | `owner`, `organisation_admin`, `principal` |
| `teacher_performance.view_detail` | Teacher Performance | View teacher assigned class metrics, historical term sparklines, and value-added data. | `owner`, `organisation_admin`, `principal` |
| `teacher_performance.manage_criteria` | Teacher Performance | Edit versioned performance risk rules with live preview before saving. | `owner`, `organisation_admin`, `principal` |
| `teacher_performance.manage_alerts` | Teacher Performance | Review, confirm, acknowledge, and resolve supportive teacher intervention alerts. | `owner`, `organisation_admin`, `principal` |
| `teacher_performance.export` | Teacher Performance | Download teacher performance summary and individual dossiers (.xlsx). | `owner`, `organisation_admin`, `principal` |
| `teacher_performance.view_own` | Teacher Performance | Allow teachers to view their own summary card and assigned classes (when enabled). | `teacher` (Self only, if school setting active) |
| `teacher_performance.private_notes` | Teacher Performance | Record and inspect private leadership observations hidden from the teacher. | `owner`, `organisation_admin`, `principal` |

---

## 2. Role-by-Role Scope & Permissions

### What Each Role Can See and Change

| Role | Scope | Can See | Can Change / Act | Prohibited |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Admin** (`platform_admin` / superuser) | System-wide (Cross-tenant) | Unscoped diagnostic aggregates. | System settings and plan provisioning. | Normal day-to-day student/staff identifiable records. |
| **School Owner / Org Admin** (`owner`, `organisation_admin`) | All campuses of organisation | All Record pages, individual salary lines, terminated notes, full teacher performance dashboards, alerts, criteria. | Record/amend/void lifecycle events, configure criteria, confirm/resolve alerts, export Excel. | Other organisations' data. |
| **School Principal** (`principal`, `school_admin`) | Assigned campus only | Staff, Students, Fees, Finance records for assigned campus. Salary totals (individual lines masked by default). Teacher performance overview, detail, alerts, criteria. | Record/amend/void lifecycle events for own campus, confirm suggested alerts, record private notes, export Excel. | Accessing other campuses (HTTP 403 on tampering). Viewing terminated notes. Viewing individual salary lines unless unlocked by owner. |
| **Accountant** (`accountant` / `staff`) | Assigned campus only | Fees and Income/Expense pages for assigned campus only. | Record payments / finance entries. | Staff records, Student academic records, Salaries, Teacher performance (HTTP 403). |
| **Teacher** (`teacher`) | Assigned classes / Self | Own performance summary and classes ONLY (if school setting `teachers_can_view_own_performance` is true). | Submit self-reflection notes. | Record module (HTTP 403). Other teachers' performance (HTTP 403). Alerts or leadership private notes. |
| **Student** (`student`) | Self only | None in Record or Teacher Performance modules. | None. | Completely blocked (HTTP 403). |
| **Parent** (`parent`) | Enrolled wards only | None in Record or Teacher Performance modules. | None. | Completely blocked (HTTP 403). |

---

## 3. Capability Mapping by Role

| Capability | Platform Admin | Owner / Org Admin | Principal | Teacher (Self) | Teacher (Others) | Accountant | Student / Parent |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `records.view_staff` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `records.view_students` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `records.view_fees` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ✅ | ❌ |
| `records.view_finance` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ✅ | ❌ |
| `records.view_salaries` | ❌ | ✅ | ✅ (Totals Only) | ❌ | ❌ | ❌ | ❌ |
| `records.view_salary_lines` | ❌ | ✅ | Optional (Default Off) | ❌ | ❌ | ❌ | ❌ |
| `records.view_terminated_notes` | ❌ | ✅ | ❌ (Strictly Blocked) | ❌ | ❌ | ❌ | ❌ |
| `records.manage` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `records.export` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ✅ (Fees/Finance) | ❌ |
| `teacher_performance.view_summary` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `teacher_performance.view_detail` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `teacher_performance.manage_criteria` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `teacher_performance.manage_alerts` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `teacher_performance.export` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |
| `teacher_performance.view_own` | ❌ | ❌ | ❌ | ✅ (If Enabled) | ❌ | ❌ | ❌ |
| `teacher_performance.private_notes` | ❌ | ✅ | ✅ (Own Campus) | ❌ | ❌ | ❌ | ❌ |

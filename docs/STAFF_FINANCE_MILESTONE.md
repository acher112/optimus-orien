# Staff, Finance and Gender Reports milestone

## Added
- **Staff** (`/api/v1/staff/...`): add, promote, assign role, terminate, reinstate, per-person and campus-wide history. Staff records are separate from sign-in accounts; terminating switches off a linked login immediately. Only organisation/school admins may grant principal or school_admin; nobody can change their own record. Managers: organisation admin, school admin, principal (own campus only).
- **Finance** (`/api/v1/finance/...`): admin/principal-defined income and expense categories (defaults seeded per campus), income and expense entries, void instead of delete, summary endpoint feeding the expense pie, income chart and monthly trend. A simple ledger, not accounting or payroll.
- **Gender**: `Student.gender` (male/female/blank). Boys (blue) / girls (pink) split at organisation, campus, class and subject report levels. If any non-empty group has fewer than 3 students, both averages are hidden.
- **My performance** (`/api/v1/reports/me/`): students and parents see own results (gray) beside boys and girls class averages; no other student is identified.
- Migration `0004_staff_finance_gender`; `seed_demo` adds genders, staff, finance data, `student_demo` and `parent_demo`.

## Tests
112 backend tests pass (19 new: staff, finance, gender reports). Frontend `npm run build` has no TypeScript errors. Not clicked through in a browser.

## Not built yet
Invitation / account-activation flow, finance export, payroll, staff attendance.

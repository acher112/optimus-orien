# OPTIMUS ORIEN — Isolated Teacher Portal Implementation & Audit

**Date:** October 30, 2026  
**Status:** Completed & Verified  
**Scope:** Class Teacher and Subject Teacher Isolated Portals, Teaching Assignments Data Model, Server-side Scope Enforcement, Field-level Data Minimisation, Staff Provisioning with Email Login, Single-use Invitations, Temporary Passwords, and Responsive Front-end.

---

## 1. Executive Summary

The Isolated Teacher Portal provides strict role-based and assignment-based isolation for teachers across the OPTIMUS ORIEN platform:
1. **Class Teacher**: In charge of one or more homeroom classes. Enjoys authority over the class, marks the daily register, views full student profiles (including guardian contacts and DOB), monitors all subject results, and opens student review cases.
2. **Subject Teacher**: Teaches specific subject(s) in specific class(es). Accesses only assigned `(class, subject)` pairs, creates assessments and enters marks only for their own subject, and views a **strictly minimised student profile** (guardian contacts, father/mother name, DOB, and address are omitted).
3. **Mixed Teacher**: Assigned as class teacher for one class and subject teacher for other classes. Privileges are evaluated strictly **per class** without cross-class privilege leakage.

---

## 2. Architecture & Data Model

### 2.1 Database Entities
- **`ClassTeacherAssignment`**: Tracks active and historical class teachers per `SchoolClass`.
  - Enforces `unique_active_class_teacher` constraint (`school_class` unique where `end_date IS NULL`).
  - Compatible with `SchoolClass.teacher` (lead teacher pointer maintained).
- **`TeachingAssignment`**: Records subject teaching duties: `school`, `teacher`, `school_class`, `subject`, `start_date`, `end_date`, `created_by`.
  - Enforces `unique_active_teaching_assignment` (`teacher, school_class, subject` unique where `end_date IS NULL`).
- **`StaffMember.teacher_type`**: Reflects dynamic teacher classification: `class_teacher`, `subject_teacher`, `both`, or `''`. Automatically computed and kept in sync via `compute_teacher_type()` / `sync_teacher_type()`.
- **`Assessment.created_by` & `teaching_assignment`**: Explicitly binds each assessment to its author and teaching assignment.
- **`User.must_change_password`**: Enforces immediate credential renewal upon first sign-in when temporary passwords are used.
- **Organisation Settings**:
  - `allow_temporary_passwords` (default: `False`)
  - `class_teacher_can_edit_all_subject_marks` (default: `False`)
  - `teachers_keep_read_access_to_own_history` (default: `True`)
  - `max_classes_per_class_teacher` (default: `1`)
  - `teachers_can_export` (default: `True`)

### 2.2 Server-Side Scope Service (`TeacherScope`)
- Located at `backend/core/services/teacher_scope.py`.
- Computes in a single query pass with request-level memoization:
  - `full_class_ids`: Classes where teacher is active homeroom/class teacher.
  - `subject_pairs`: Active `(class_id, subject_id)` assignments.
  - `subject_class_ids`: Classes where teacher teaches at least one subject.
  - `class_ids`: Union of `full_class_ids` and `subject_class_ids`.
  - `teacher_type`: Dynamic role label.
  - Permission checks: `can_edit_subject_marks(class_id, subject_id)`, `can_mark_daily_attendance(class_id)`, `is_class_teacher(class_id)`, `is_subject_teacher(class_id, subject_id)`.

### 2.3 Access Control & Data Minimisation
- **`core/services/access.py`**:
  - `classes_scope`: Filters `SchoolClass` queryset strictly to `TeacherScope.class_ids`.
  - `students_scope`: Filters `Student` queryset to students actively enrolled in `TeacherScope.class_ids`.
  - `queryset_for`: Applies strict ownership and assignment scoping for `Assessment`, `Grade`, `Attendance`, `Homework`, `Observation`, and `ReviewCase`.
  - Out-of-scope IDs return HTTP 404.
- **`TeacherStudentSerializer`**:
  - Used dynamically by `Students.get_serializer_class()` and `StudentSerializer.to_representation()`.
  - For students where the teacher is only a subject teacher, fields `father_name`, `mother_name`, `guardian_phone`, `dob`, and `address` are completely omitted from the JSON payload.
- **Hard Boundaries**:
  - Teachers receive HTTP 403 on `/api/v1/finance/`, `/api/v1/fees/`, `/api/v1/salaries/`, `/api/v1/staff/`, `/api/v1/teachers/`, `/api/v1/audit/`, `/api/v1/reports/overview/`, and `/api/v1/reports/campus/`.

---

## 3. Front-end Architecture

### 3.1 Teacher Home Dashboard (`TeacherHome.tsx`)
- Matching Part 4 §2 and specifications TDB-001..021:
  - **Assignment Cards**: Role label, class, subject, student count, and daily register status.
  - **Actionable Tasks**: Missing daily registers, pending marks by assessment, unreviewed homework submissions, and results awaiting approval.
  - **Subject Averages with Coverage**: Displays valid student result ratios (e.g. `24 / 25 learners (96%)`). Missing results are never treated as 0.
  - **Decline Indicators**: Students showing academic decline with objective evidence (previous score vs current score).
  - Activity metrics (register submissions) separated from quality/academic outcomes (TDB-021). No cross-teacher rankings or leaderboards (TDB-020).

### 3.2 My Class (`TeacherMyClass.tsx`)
- Homeroom dashboard for Class Teachers:
  - Student directory with full profiles.
  - Search by learner name/admission ID and **Father Name filter**.
  - Class attendance percentage and all-subject averages.
  - Review cases active for the class.

### 3.3 My Subjects (`TeacherMySubjects.tsx`)
- Dedicated workspace for Subject Teachers:
  - Cards per assigned `(class, subject)`.
  - Quick action links for creating assessments, entering marks, and setting homework.
  - Subject coverage and performance trends.

### 3.4 Isolated Navigation & Route Guards (`main.tsx`)
- Isolated sidebar navigation rendered when `user.role === 'teacher'`.
- All forbidden modules (`Finance`, `Student fees`, `Staff`, `Salaries`, `Campuses`, `Audit log`, `Settings/permissions`, `Academic years`) are completely removed from the menu.
- Direct URL route guards display a clear "Access Restricted" view.
- Header displays dynamic assignment badges: e.g. `Class Teacher – Class 7A`, `Subject Teacher – Class 8B (Maths)`.

---

## 4. Requirement Verification & Audit Matrix

| Spec ID | Requirement | Implementation & Verification | Status |
|---|---|---|---|
| **TDB-001** | Assignment-based access | `TeacherScope` dynamically binds access to active teaching assignments. | Verified |
| **TDB-002** | Homeroom vs Subject distinction | Distinct scopes: full class authority for class teacher, subject-only for subject teacher. | Verified |
| **TDB-003** | Assignment history preserved | `ClassTeacherAssignment` and `TeachingAssignment` preserve start/end dates. Never hard deleted. | Verified |
| **TDB-004** | Shared teaching assignments | Multiple teachers can be assigned to the same `(class, subject)` without collisions. | Verified |
| **TDB-005** | Former teacher history access | Historical records accessible read-only via `teachers_keep_read_access_to_own_history`. | Verified |
| **TDB-006** | Historical records attribution | `Assessment.created_by` explicitly records the authoring teacher. | Verified |
| **TDB-008** | Complete isolation from forbidden areas | 403 / 404 returned on finance, staff, salaries, fees, audit, other campuses. | Verified |
| **TDB-010** | Overdue indicators with deadlines | Tasks marked overdue only when configured deadline is strictly passed. | Verified |
| **TDB-020** | No cross-teacher leaderboard | Teacher dashboard shows only own classes; no peer comparisons or rankings. | Verified |
| **TDB-021** | Separation of activity and quality | Attendance register completion tracked separately from academic grades. | Verified |
| **AUTH-009**| Email-based login & invitations | Teachers created with email, single-use 72h invitation token or temporary password. | Verified |
| **ATT-032** | Attendance register authority | Daily register restricted to assigned class teacher; subject teachers are read-only. | Verified |
| **IND-003** | Observation and skills scoping | Observations scoped strictly to assigned subjects/classes. | Verified |
| **ORG-019** | Strict campus isolation | Teachers only see assigned campus(es); out-of-scope campuses return 404. | Verified |
| **ORG-020** | Data minimization for subject teachers| Guardian contacts, father name, DOB, and address omitted for subject teachers. | Verified |

---

## 5. Verification Test Suite Results

1. **`core.tests.test_isolated_teacher_portal`**:
   - `Ran 14 tests in 89.2s — OK (14/14 passed)`
2. **`core.tests.test_campus_isolation_and_admission`**:
   - `Ran 5 tests in 42.4s — OK (5/5 passed)`
3. **`core.tests.test_dashboard_defaulters_risk`**:
   - `Ran 10 tests in 138.2s — OK (10/10 passed)`
4. **Frontend TypeScript & Vite Build (`npm run build`)**:
   - `✓ 2234 modules transformed — built cleanly with 0 errors in 25.5s`

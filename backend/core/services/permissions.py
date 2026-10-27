"""Centralized Role-Based Access Control (RBAC) catalog, resolution, and persistence services.

Defines all modules, granular action permissions, human-readable metadata,
and documented defaults for each of the six core institutional roles.
Supports per-campus / per-organization overrides stored in the RolePermission model.
"""
from typing import Dict, List, Any, Optional
from django.db import transaction

ROLES_METADATA = [
    {
        'key': 'organisation_admin',
        'label': 'Super Owner / Org Admin',
        'description': 'Full administrative control across all campuses in the educational trust/network.',
        'badge': 'Super Owner',
        'icon': 'Building2',
        'priority': 1,
    },
    {
        'key': 'school_admin',
        'label': 'Campus Administrator',
        'description': 'Comprehensive operational authority over single campus academics, staff, finances, and students.',
        'badge': 'Campus Admin',
        'icon': 'Shield',
        'priority': 2,
    },
    {
        'key': 'principal',
        'label': 'Campus Principal / Academic Head',
        'description': 'Academic oversight, curriculum leadership, staff management, case resolution, and analytics.',
        'badge': 'Principal',
        'icon': 'Award',
        'priority': 3,
    },
    {
        'key': 'teacher',
        'label': 'Educator / Teacher',
        'description': 'Classroom management, student attendance, homework, assessments, study materials, and messaging.',
        'badge': 'Teacher',
        'icon': 'Users',
        'priority': 4,
    },
    {
        'key': 'student',
        'label': 'Learner / Student',
        'description': 'Personal academic dashboard: published grades, attendance, homework submission, timetable, and challans.',
        'badge': 'Student',
        'icon': 'GraduationCap',
        'priority': 5,
    },
    {
        'key': 'parent',
        'label': 'Parent / Guardian',
        'description': 'Guardian portal: view children attendance, published marks, fee challans, payment history, and notices.',
        'badge': 'Guardian',
        'icon': 'HeartHandshake',
        'priority': 6,
    },
]

# Complete Catalog of System Permissions Grouped by Module
PERMISSIONS_MODULES = [
    {
        'id': 'students',
        'name': 'Students & Enrolment',
        'icon': 'GraduationCap',
        'description': 'Learner registration, admissions, demographic records, and campus transfers',
        'permissions': [
            {
                'key': 'students.view',
                'name': 'View Student Directory & Profiles',
                'description': 'Browse student list, view personal profiles, and check enrolment status',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'students.create',
                'name': 'Register New Students',
                'description': 'Enrol new learners and generate initial admission records',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'students.edit',
                'name': 'Edit Student Details',
                'description': 'Update student personal details, guardian links, and contact information',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'students.delete',
                'name': 'Delete Student Records',
                'description': 'Remove student records and associated enrolments from the database',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'students.transfer',
                'name': 'Transfer Students Across Campuses/Classes',
                'description': 'Execute atomic transfers while maintaining historical grade and attendance records',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'students.export',
                'name': 'Export Student Records',
                'description': 'Download student directory in CSV, Excel, or formatted PDF format',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'academics',
        'name': 'Academic Structure & Curriculum',
        'icon': 'BookOpen',
        'description': 'Classes, sections, subjects, teaching allocations, and academic years',
        'permissions': [
            {
                'key': 'classes.view',
                'name': 'View Classes & Sections',
                'description': 'Inspect class rosters, student counts, and assigned teachers',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'classes.manage',
                'name': 'Manage Classes & Sections',
                'description': 'Create, edit, and delete school classes, sections, and grade levels',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'subjects.view',
                'name': 'View Subjects Curriculum',
                'description': 'Browse subjects taught at the campus and syllabus outlines',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'subjects.manage',
                'name': 'Manage Subjects & Courses',
                'description': 'Create, modify, and assign curriculum subjects to classes',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'years.view',
                'name': 'View Academic Sessions',
                'description': 'View academic session calendar, start dates, and end dates',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'years.manage',
                'name': 'Manage Academic Sessions',
                'description': 'Define new academic years and transition term boundaries',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
        ],
    },
    {
        'id': 'attendance',
        'name': 'Attendance Registration',
        'icon': 'ClipboardCheck',
        'description': 'Daily roll-call, session recording, absence tracking, and attendance audit',
        'permissions': [
            {
                'key': 'attendance.view',
                'name': 'View Attendance Registers',
                'description': 'Inspect daily, weekly, and monthly attendance sheets and rates',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'attendance.record',
                'name': 'Take Daily / Lesson Attendance',
                'description': 'Mark student statuses (present, absent, late, excused) in attendance sheets',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'attendance.edit',
                'name': 'Modify Recorded Attendance',
                'description': 'Correct past attendance slips with audit trail tracking',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'attendance.export',
                'name': 'Export Attendance Registers',
                'description': 'Generate monthly register printouts and attendance spreadsheets',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
        ],
    },
    {
        'id': 'grading',
        'name': 'Academics & Grading',
        'icon': 'FileBarChart',
        'description': 'Formative tests, mark entry, grade book moderation, and result publication',
        'permissions': [
            {
                'key': 'assessments.view',
                'name': 'View Assessments & Tests',
                'description': 'Browse assessment schedules, weightings, and test descriptions',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'assessments.create',
                'name': 'Create & Schedule Assessments',
                'description': 'Set up quizzes, term tests, and define maximum marks',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'grades.enter',
                'name': 'Enter Student Marks & Grades',
                'description': 'Input and edit student assessment scores in the grade book',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'grades.publish',
                'name': 'Publish Results to Students & Parents',
                'description': 'Approve and release assessment marks to public student/parent portals',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'homework',
        'name': 'Homework & Tasks',
        'icon': 'ClipboardList',
        'description': 'Homework assignments, deadline management, submissions, and educator reviews',
        'permissions': [
            {
                'key': 'homework.view',
                'name': 'View Homework Tasks',
                'description': 'Inspect assigned tasks, instructions, and due dates',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'homework.create',
                'name': 'Assign Homework Tasks',
                'description': 'Post new homework tasks with instructions and deadlines',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'homework.submit',
                'name': 'Submit Homework Solutions',
                'description': 'Upload completed homework files and notes',
                'default_roles': {'student'},
            },
            {
                'key': 'homework.review',
                'name': 'Review & Confirm Submissions',
                'description': 'Inspect submitted work, mark as completed, and provide feedback',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
        ],
    },
    {
        'id': 'examinations',
        'name': 'Examinations & Timetable',
        'icon': 'Award',
        'description': 'Formal exams, paper scheduling, seating, invigilation, and report cards',
        'permissions': [
            {
                'key': 'exams.view',
                'name': 'View Exam Schedules & Timetables',
                'description': 'Access exam sessions, timetable schedules, and paper dates',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'exams.manage',
                'name': 'Manage Exam Sessions & Papers',
                'description': 'Create exam terms, schedule paper slots, and configure grading scales',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'exams.marks',
                'name': 'Enter & Moderate Exam Marks',
                'description': 'Input exam marks into the official marksheet and print report cards',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'exams.seating',
                'name': 'Manage Invigilators & Seating Plans',
                'description': 'Assign invigilation duties and hall seating arrangements',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'study_materials',
        'name': 'Study Materials & Resources',
        'icon': 'BookOpen',
        'description': 'Digital syllabus notes, lecture handouts, past papers, and reference documents',
        'permissions': [
            {
                'key': 'materials.view',
                'name': 'View & Download Study Materials',
                'description': 'Access approved classroom resources, notes, and attachments',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'materials.upload',
                'name': 'Upload New Study Materials',
                'description': 'Upload and publish learning materials for enrolled classrooms',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'materials.manage',
                'name': 'Manage, Replace & Archive Materials',
                'description': 'Upload updated revisions, archive older editions, or remove materials',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
        ],
    },
    {
        'id': 'fees',
        'name': 'Student Fees & Challans',
        'icon': 'Receipt',
        'description': 'Tuition challans, admission fees, payments, admin approval workflow, and concessions',
        'permissions': [
            {
                'key': 'fees.view',
                'name': 'View Fee Overview & Challans',
                'description': 'Browse student fee ledgers, voucher balances, and receipts',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'student', 'parent'},
            },
            {
                'key': 'fees.structure_manage',
                'name': 'Configure Fee Structures & Heads',
                'description': 'Define tuition heads, class-wise fee rules, and due dates',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'fees.challan_create',
                'name': 'Generate Billing Vouchers & Challans',
                'description': 'Generate monthly/annual challan vouchers for students',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'fees.collect',
                'name': 'Collect Fee Payments',
                'description': 'Record fee payment deposits and issue bank/cash receipts',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'fees.approve',
                'name': 'Approve Fee Payments (Post to Income)',
                'description': 'Verify submitted challans and post receipts into institutional Income',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'fees.void',
                'name': 'Void Receipts & Cancel Vouchers',
                'description': 'Void erroneous receipts and reverse posted ledger entries',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'fees.concessions',
                'name': 'Manage Fee Concessions & Discounts',
                'description': 'Grant sibling, merit, or hardship discounts to students',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'staff_salaries',
        'name': 'Staff Directory & Payroll',
        'icon': 'Briefcase',
        'description': 'Staff employment, compensation blueprints, monthly payroll, and disbursements',
        'permissions': [
            {
                'key': 'staff.view',
                'name': 'View Staff Directory',
                'description': 'Inspect employee profiles, positions, and active contracts',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'staff.manage',
                'name': 'Hire & Manage Staff Profiles',
                'description': 'Add new staff members, edit roles, or terminate contracts',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'salaries.view',
                'name': 'View Payroll Sheets & Payslips',
                'description': 'Inspect salary sheets, deductions, allowances, and personal payslips',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'salaries.structure_manage',
                'name': 'Configure Salary Structures',
                'description': 'Define base salary, tax rates, and recurring allowances for staff',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'salaries.generate',
                'name': 'Generate Monthly Payroll Drafts',
                'description': 'Compute gross, adjustments, and net salary for all active staff',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'salaries.disburse',
                'name': 'Disburse & Pay Salaries (Post to Expense)',
                'description': 'Authorize monthly salary payouts and record into Expense ledger',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
        ],
    },
    {
        'id': 'finance',
        'name': 'Finance & Accounting',
        'icon': 'Wallet',
        'description': 'Campus revenue, operating expenditures, general ledgers, and cash flow',
        'permissions': [
            {
                'key': 'finance.view',
                'name': 'View Financial Overview & Dashboards',
                'description': 'Monitor institutional income, operational costs, and net margin',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'finance.income_create',
                'name': 'Record Direct Non-Fee Income',
                'description': 'Post grants, donations, canteen, and auxiliary income',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'finance.expense_create',
                'name': 'Record Operational Expenses',
                'description': 'Record campus utilities, supplies, maintenance, and bills',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'finance.void',
                'name': 'Void Financial Transactions',
                'description': 'Cancel incorrect ledger entries with full audit reasoning',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
            {
                'key': 'finance.export',
                'name': 'Export Financial Reports & Statements',
                'description': 'Download balance sheets, income statements, and cash reports',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'interventions',
        'name': 'Student Support & Interventions',
        'icon': 'HeartHandshake',
        'description': 'Early warning tracking, pastoral review cases, and support action plans',
        'permissions': [
            {
                'key': 'cases.view',
                'name': 'View Student Support Cases',
                'description': 'Review open cases flagged for attendance, academic, or behavioral needs',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'cases.create',
                'name': 'Open New Support Cases',
                'description': 'Flag a learner for early intervention with documented evidence',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'cases.manage',
                'name': 'Assign Actions & Interventions',
                'description': 'Delegate case actions, log parental meetings, and update progress',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'cases.resolve',
                'name': 'Sign Off & Close Cases',
                'description': 'Formally sign off on student recovery and resolve review cases',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'communication',
        'name': 'Communication & Broadcasts',
        'icon': 'MessageSquare',
        'description': 'Classroom messaging, Q&A channels, official circulars, and announcements',
        'permissions': [
            {
                'key': 'communication.view',
                'name': 'View Classroom Discussions',
                'description': 'Browse question feeds and subject discussions for enrolled classes',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'communication.send',
                'name': 'Send Classroom Messages & Answers',
                'description': 'Ask questions, reply to student queries, and participate in chats',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'announcements.view',
                'name': 'View School Circulars & Notices',
                'description': 'Read institutional broadcasts, event notices, and circulars',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'},
            },
            {
                'key': 'announcements.create',
                'name': 'Broadcast School Announcements',
                'description': 'Publish campus-wide announcements targeted to specific roles',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
        ],
    },
    {
        'id': 'reports_system',
        'name': 'Analytics, Audit & Governance',
        'icon': 'ShieldCheck',
        'description': 'Campus intelligence, universal reporting, security audit log, and role permissions',
        'permissions': [
            {
                'key': 'reports.view',
                'name': 'View Academic & Attendance Analytics',
                'description': 'Inspect aggregate student performance, attendance distributions, and KPI charts',
                'default_roles': {'organisation_admin', 'school_admin', 'principal', 'teacher'},
            },
            {
                'key': 'reports.export',
                'name': 'Universal Data Export (CSV/PDF)',
                'description': 'Export campus data tables, rosters, and analytical spreadsheets',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'audit.view',
                'name': 'Inspect Security Audit Log',
                'description': 'Inspect chronological immutable logs of user actions and entity modifications',
                'default_roles': {'organisation_admin', 'school_admin', 'principal'},
            },
            {
                'key': 'permissions.manage',
                'name': 'Manage Role Permissions & Access Rules',
                'description': 'Assign granular permissions to institutional roles and configure campus access',
                'default_roles': {'organisation_admin', 'school_admin'},
            },
        ],
    },
]

# Quick index mapping: permission_key -> permission dict
ALL_PERMISSIONS_MAP = {}
for mod in PERMISSIONS_MODULES:
    for perm in mod['permissions']:
        ALL_PERMISSIONS_MAP[perm['key']] = {
            **perm,
            'module_id': mod['id'],
            'module_name': mod['name'],
        }


def get_catalog() -> List[Dict[str, Any]]:
    """Returns the full hierarchical permissions catalog."""
    return PERMISSIONS_MODULES


def get_default_permissions_for_role(role: str) -> Dict[str, bool]:
    """Returns the baseline dictionary of permissions for a role according to system defaults."""
    res = {}
    for key, pdata in ALL_PERMISSIONS_MAP.items():
        res[key] = (role in pdata['default_roles'])
    return res


def get_effective_permissions(school, role: str) -> Dict[str, bool]:
    """Computes the effective permissions for a role, merging defaults with database overrides."""
    # Start with system defaults for this role
    perms = get_default_permissions_for_role(role)

    # If role is unknown, return all False
    if not any(r['key'] == role for r in ROLES_METADATA):
        return {k: False for k in ALL_PERMISSIONS_MAP}

    # Query custom overrides from RolePermission
    from core.models import RolePermission
    qs = RolePermission.objects.filter(role=role)
    if school:
        qs = qs.filter(school=school)
    else:
        qs = qs.filter(school__isnull=True)

    for rp in qs:
        if rp.permission_key in perms:
            perms[rp.permission_key] = rp.granted

    return perms


def get_all_roles_matrix(school) -> Dict[str, Any]:
    """Returns a complete summary matrix for the permissions dashboard."""
    from core.models import RolePermission

    effective_by_role = {}
    defaults_by_role = {}
    override_counts = {}

    for r in ROLES_METADATA:
        role_key = r['key']
        defaults_by_role[role_key] = get_default_permissions_for_role(role_key)
        effective = get_effective_permissions(school, role_key)
        effective_by_role[role_key] = effective

        # Count how many permissions differ from defaults
        diff_count = 0
        for pkey, is_granted in effective.items():
            if defaults_by_role[role_key].get(pkey) != is_granted:
                diff_count += 1
        override_counts[role_key] = diff_count

    return {
        'roles': ROLES_METADATA,
        'modules': PERMISSIONS_MODULES,
        'effective_by_role': effective_by_role,
        'defaults_by_role': defaults_by_role,
        'override_counts': override_counts,
        'total_permissions_count': len(ALL_PERMISSIONS_MAP),
    }


def update_role_permissions(school, role: str, permissions_dict: Dict[str, bool], actor) -> int:
    """Updates database overrides for a specific role atomically.
    Removes overrides that match defaults, and saves ones that differ.
    """
    from core.models import RolePermission
    from core.services.audit import record_event

    defaults = get_default_permissions_for_role(role)
    updated_count = 0

    with transaction.atomic():
        for pkey, granted in permissions_dict.items():
            if pkey not in ALL_PERMISSIONS_MAP:
                continue

            default_val = defaults.get(pkey, False)
            if granted == default_val:
                # Matches default, remove custom override if present
                RolePermission.objects.filter(school=school, role=role, permission_key=pkey).delete()
            else:
                # Custom override differs from default
                rp, created = RolePermission.objects.update_or_create(
                    school=school, role=role, permission_key=pkey,
                    defaults={'granted': granted, 'updated_by': actor}
                )
                updated_count += 1

        record_event(
            actor=actor,
            action='update_role_permissions',
            obj=school if school else actor,
            changed_fields=['role_permissions'],
            before={'role': role},
            after={'role': role, 'custom_overrides_count': updated_count}
        )

    return updated_count


def reset_role_permissions(school, role: Optional[str] = None, actor = None) -> int:
    """Clears all customized overrides for a role (or all roles), reverting back to baseline defaults."""
    from core.models import RolePermission
    from core.services.audit import record_event

    with transaction.atomic():
        qs = RolePermission.objects.all()
        if school:
            qs = qs.filter(school=school)
        else:
            qs = qs.filter(school__isnull=True)

        if role:
            qs = qs.filter(role=role)

        count = qs.count()
        qs.delete()

        if actor:
            record_event(
                actor=actor,
                action='reset_role_permissions',
                obj=school if school else actor,
                changed_fields=['role_permissions'],
                before={'role': role or 'all', 'overrides_deleted': count},
                after={'role': role or 'all', 'status': 'restored_defaults'}
            )

    return count


def has_role_permission(user, permission_key: str) -> bool:
    """Helper function to check whether a user has a specific permission."""
    if not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True

    effective = get_effective_permissions(getattr(user, 'school', None), user.role)
    return effective.get(permission_key, False)

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import (
    views, onboarding_views, reports, staff, finance, communication,
    fees, salaries, exams, platform_owner, imports, announcements, study_materials,
    permission_views, views_risk
)

r = DefaultRouter()
for name, view in [
    ('schools', views.Schools),
    ('classes', views.Classes),
    ('students', views.Students),
    ('subjects', views.Subjects),
    ('years', views.Years),
    ('enrollments', views.Enrollments),
    ('assessments', views.Assessments),
    ('grades', views.Grades),
    ('attendance', views.AttendanceRecords),
    ('homework', views.HomeworkItems),
    ('submissions', views.Submissions),
    ('observations', views.Observations),
    ('cases', views.Cases),
    ('interventions', views.Interventions),
    ('notifications', views.Notifications),
    ('audit', views.AuditLog)
]:
    r.register(name, view, basename=name)

urlpatterns = [
    # Staff HR & Lifecycle
    path('staff/', staff.staff_list),
    path('staff/history/', staff.staff_history),
    path('staff/<int:pk>/', staff.staff_detail),
    path('staff/<int:pk>/promote/', staff.staff_promote),
    path('staff/<int:pk>/assign-role/', staff.staff_assign_role),
    path('staff/<int:pk>/terminate/', staff.staff_terminate),
    path('staff/<int:pk>/reinstate/', staff.staff_reinstate),

    # Finance
    path('finance/summary/', finance.summary),
    path('finance/categories/', finance.categories),
    path('finance/categories/<int:pk>/', finance.category_detail),
    path('finance/entries/', finance.entries),
    path('finance/entries/<int:pk>/', finance.entry_detail),
    path('finance/entries/<int:pk>/void/', finance.entry_void),

    # Fees Management
    path('fees/heads/', fees.heads),
    path('fees/heads/<int:pk>/', fees.head_detail),
    path('fees/structures/', fees.structures),
    path('fees/structures/<int:pk>/', fees.structure_detail),
    path('fees/concessions/', fees.concessions),
    path('fees/concessions/<int:pk>/', fees.concession_detail),
    path('fees/vouchers/generate/', fees.generate_vouchers),
    path('fees/student-voucher/', fees.student_voucher_create),
    path('fees/vouchers/', fees.student_voucher_create),
    path('fees/ledger/<int:student_id>/', fees.student_ledger),
    path('fees/payments/', fees.payments),
    path('fees/payments/<int:pk>/approve/', fees.payment_approve),
    path('fees/payments/bulk-approve/', fees.payments_bulk_approve),
    path('fees/payments/<int:pk>/void/', fees.payment_void),
    path('fees/defaulters/', fees.defaulters),
    path('fees/defaulters/<int:student_id>/remind/', fees.defaulter_send_reminder),
    path('fees/summary/', fees.fees_summary),

    # Staff Salaries
    path('salaries/structures/', salaries.salary_structures),
    path('salaries/adjustments/', salaries.salary_adjustments),
    path('salaries/generate/', salaries.salaries_generate),
    path('salaries/sheet/', salaries.salaries_sheet),
    path('salaries/sheet/<int:pk>/pay/', salaries.salary_pay),
    path('salaries/sheet/<int:pk>/status/', salaries.salary_status_update),
    path('salaries/sheet/<int:pk>/void/', salaries.salary_void),
    path('salaries/sheet/<int:pk>/payslip/', salaries.salary_payslip),
    path('salaries/my-payslips/', salaries.my_payslips),
    path('salaries/summary/', salaries.salaries_summary),

    # Examinations
    path('exams/sessions/', exams.exam_sessions),
    path('exams/sessions/<int:pk>/', exams.exam_session_detail),
    path('exams/sessions/<int:pk>/publish/', exams.exam_session_publish),
    path('exams/papers/', exams.exam_papers),
    path('exams/papers/<int:pk>/', exams.exam_paper_detail),
    path('exams/papers/<int:paper_id>/marks/', exams.exam_marks_grid),
    path('exams/corrections/', exams.exam_corrections),
    path('exams/results-sheet/', exams.exam_results_sheet),
    path('exams/report-card/', exams.student_report_card),
    path('exams/grading-scales/', exams.grading_scales),

    # Platform Owner & Governance
    path('platform/overview/', platform_owner.platform_overview),
    path('platform/plans/', platform_owner.platform_plans),
    path('platform/support-grants/', platform_owner.support_grants),
    path('platform/support-grants/<int:pk>/revoke/', platform_owner.support_grant_revoke),
    path('invitations/', platform_owner.invitations),
    path('invitations/accept/', platform_owner.accept_invitation),
    path('holidays/', platform_owner.holiday_calendar),
    path('holidays/<int:pk>/', platform_owner.holiday_calendar),
    path('timetables/', platform_owner.class_timetables),
    path('timetables/<int:pk>/', platform_owner.timetable_detail),
    path('imports/csv/', imports.csv_import),

    # Role Permissions Management
    path('permissions/', permission_views.permissions_list),
    path('permissions/reset/', permission_views.permissions_reset),

    # Existing core endpoints
    path('public/indicators/', onboarding_views.public_school_indicators),
    path('schools/<int:school_id>/setup/', onboarding_views.school_configuration),
    path('schools/<int:school_id>/setup/activate/', onboarding_views.activate_school_configuration),
    path('auth/csrf/', views.csrf),
    path('auth/login/', views.signin),
    path('auth/register/', views.register_account),
    path('auth/logout/', views.signout),
    path('auth/me/', views.me),
    path('dashboard/', views.dashboard),
    path('students/<int:pk>/transfer/', views.transfer_student),
    path('reports/', reports.overview),
    path('reports/me/', reports.my_performance),
    path('reports/overview/', reports.overview),
    path('reports/campus/<int:school_id>/', reports.campus),
    path('reports/class/<int:class_id>/', reports.class_report),
    path('reports/campus/<int:school_id>/subject/<str:code>/', reports.subject_report),
    path('exports/students.csv', views.export_students),
    path('teachers/', views.teachers_list),
    path('accounts/', views.create_account),
    path('communication/channels/', communication.channels),
    path('communication/messages/', communication.messages),
    path('communication/messages/<int:pk>/', communication.message_detail),
    path('communication/assignments/', communication.assign_teacher),
    path('campuses/register/', views.register_campus),
    path('schools/<int:school_id>/users/', views.school_users),

    # Announcements
    path('announcements/', announcements.announcements_list),
    path('announcements/<int:pk>/', announcements.announcement_detail),

    # Universal Export
    path('export/', views.universal_export),

    # Study Materials
    path('materials/', study_materials.materials_list),
    path('materials/<int:pk>/', study_materials.material_detail),
    path('materials/<int:pk>/replace/', study_materials.material_replace),
    path('materials/<int:pk>/archive/', study_materials.material_archive),
    path('materials/<int:pk>/download/', study_materials.material_download),
    # Students at Risk (INT-001..INT-040)
    path('students/at-risk/', views_risk.students_at_risk),
    path('students/at-risk/criteria/', views_risk.risk_criteria_view),
    path('students/at-risk/criteria/activate/', views_risk.risk_criteria_activate),
    path('students/at-risk/<int:student_id>/case/', views_risk.risk_case_create),
    path('students/at-risk/<int:student_id>/dismiss/', views_risk.risk_dismiss),

    path('', include(r.urls))
]

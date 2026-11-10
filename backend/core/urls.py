from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import (
    views, onboarding_views, reports, staff, finance, communication,
    fees, salaries, exams, platform_owner, imports, announcements, study_materials,
    permission_views, views_risk, exam_engine_views, principal_views, attendance_views,
    teacher_views, aqi_views, student_views, discussion_views, psychological_evaluation_views,
    parent_views, landing_views, subscription_views
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
    # Attendance Registers (Class/Student & Staff)
    path('attendance/class-register/', attendance_views.class_attendance_register),
    path('attendance/history/', attendance_views.attendance_history),

    # Staff HR & Lifecycle
    path('staff/', staff.staff_list),
    path('staff/attendance/', staff.staff_attendance),
    path('staff/history/', staff.staff_history),
    path('staff/<int:pk>/', staff.staff_detail),
    path('staff/<int:pk>/promote/', staff.staff_promote),
    path('staff/<int:pk>/assign-role/', staff.staff_assign_role),
    path('staff/<int:pk>/terminate/', staff.staff_terminate),
    path('staff/<int:pk>/reinstate/', staff.staff_reinstate),
    path('staff/<int:pk>/assignments/', staff.staff_assignments),
    path('staff/<int:pk>/assignments/<int:assignment_id>/end/', staff.staff_end_assignment),
    path('staff/<int:pk>/assignments/transfer-class/', staff.staff_transfer_class),

    # Teacher Portal (Isolated)
    path('teacher/dashboard/', teacher_views.teacher_dashboard),
    path('teacher/my-class/', teacher_views.teacher_my_class),
    path('teacher/my-subjects/', teacher_views.teacher_my_subjects),
    path('teacher/scope/', teacher_views.teacher_scope_view),

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

    # Configurable Examination Engine & Academic Performance
    path('exams/engine/configurations/', exam_engine_views.engine_configurations),
    path('exams/engine/configurations/<int:pk>/', exam_engine_views.engine_configuration_detail),
    path('exams/engine/configurations/<int:pk>/publish/', exam_engine_views.engine_configuration_publish),
    path('exams/engine/configurations/<int:pk>/recalculate/', exam_engine_views.engine_configuration_recalculate),
    path('exams/engine/configurations/<int:config_id>/marks-grid/', exam_engine_views.engine_marks_grid),
    path('exams/engine/analytics/', exam_engine_views.engine_analytics),
    path('exams/engine/student-transcript/', exam_engine_views.engine_student_transcript),

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

    # Subscription, Invoicing & Entitlements
    path('public/pricing/', subscription_views.public_pricing_view),
    path('public/billing-info/', subscription_views.public_billing_info_view),
    path('subscription/current/', subscription_views.school_subscription_current_view),
    path('subscription/entitlements/', subscription_views.school_entitlements_view),
    path('subscription/invoice-estimate/', subscription_views.school_invoice_estimate_view),
    path('subscription/bank-details/', subscription_views.school_bank_details_view),
    path('subscription/orders/', subscription_views.school_subscription_orders_view),
    path('subscription/orders/<int:pk>/receipt/', subscription_views.school_order_receipt_view),
    path('subscription/downgrade/', subscription_views.school_subscription_downgrade_view),
    path('subscription/webhook/', subscription_views.subscription_payment_webhook_view),
    path('platform-admin/billing/settings/', subscription_views.platform_admin_billing_settings_view),
    path('platform-admin/billing/periods/', subscription_views.platform_admin_billing_periods_view),
    path('platform-admin/billing/plans/', subscription_views.platform_admin_plans_view),
    path('platform-admin/billing/plans/<int:pk>/', subscription_views.platform_admin_plan_detail_view),
    path('platform-admin/billing/features/', subscription_views.platform_admin_features_view),
    path('platform-admin/billing/schools/', subscription_views.platform_admin_schools_view),
    path('platform-admin/billing/schools/<int:school_id>/alter/', subscription_views.platform_admin_alter_school_subscription_view),
    path('platform-admin/billing/finance-analytics/', subscription_views.platform_admin_finance_analytics_view),
    path('platform-admin/billing/orders/', subscription_views.platform_admin_orders_view),
    path('platform-admin/billing/orders/<int:order_id>/approve/', subscription_views.platform_admin_order_approve_view),
    path('platform-admin/billing/orders/<int:order_id>/reject/', subscription_views.platform_admin_order_reject_view),
    path('platform-admin/billing/schools/<int:school_id>/feature-override/', subscription_views.platform_admin_feature_overrides_view),
    path('platform-admin/billing/schools/<int:school_id>/feature-override/<int:override_id>/', subscription_views.platform_admin_feature_override_delete_view),

    # Role Permissions Management
    path('permissions/', permission_views.permissions_list),
    path('permissions/reset/', permission_views.permissions_reset),

    # Public landing page CMS and contact endpoints
    path('public/landing/', landing_views.public_landing_view),
    path('public/contact/', landing_views.public_contact_view),
    path('platform-admin/landing/features/', landing_views.admin_landing_features_view),
    path('platform-admin/landing/faqs/', landing_views.admin_landing_faqs_view),
    path('platform-admin/landing/plans/', landing_views.admin_landing_plans_view),
    path('platform-admin/landing/contacts/', landing_views.admin_landing_contacts_view),

    # Existing core endpoints
    path('public/indicators/', onboarding_views.public_school_indicators),
    path('schools/<int:school_id>/setup/', onboarding_views.school_configuration),
    path('schools/<int:school_id>/setup/activate/', onboarding_views.activate_school_configuration),
    path('auth/csrf/', views.csrf),
    path('auth/login/', views.signin),
    path('auth/signin/', views.signin),
    path('auth/register/', views.register_account),
    path('auth/logout/', views.signout),
    path('auth/me/', views.me),
    path('auth/password/', views.change_password),
    path('auth/forgot-password/', views.forgot_password),
    path('auth/reset-password/', views.reset_password_with_token),
    path('dashboard/', views.dashboard),
    path('students/<int:pk>/transfer/', views.transfer_student),
    path('reports/', reports.overview),
    path('reports/me/', reports.my_performance),
    path('reports/overview/', reports.overview),
    path('reports/campus/<int:school_id>/', reports.campus),
    path('reports/campuses/<int:school_id>/', reports.campus),
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

    # Principal Portal Dashboard
    path('principal/dashboard/', principal_views.principal_dashboard),

    # Academic Quality Index (AQI) & Examination Engine (Levels 1 to 5)
    path('aqi/overview/', aqi_views.aqi_overview),
    path('aqi/campus/<int:school_id>/', aqi_views.aqi_campus),
    path('aqi/class/<int:class_id>/', aqi_views.aqi_class),
    path('aqi/class/<int:class_id>/subject/<int:subject_id>/', aqi_views.aqi_subject),
    path('aqi/student/<int:student_id>/', aqi_views.aqi_student),
    path('aqi/my-profile/', aqi_views.aqi_my_profile),
    path('aqi/explain/', aqi_views.aqi_explain),
    path('aqi/structures/', aqi_views.aqi_structures),
    path('aqi/structures/<int:pk>/', aqi_views.aqi_structure_detail),
    path('aqi/structures/<int:pk>/publish/', aqi_views.aqi_structure_publish),
    path('aqi/structures/<int:pk>/terms/', aqi_views.aqi_structure_terms),
    path('aqi/terms/<int:pk>/', aqi_views.aqi_term_detail),
    path('aqi/marks-grid/', aqi_views.aqi_marks_grid),
    path('aqi/export/', aqi_views.aqi_export),


    # Student Portal (Isolated)
    path('student/dashboard/', student_views.student_dashboard),
    path('student/attendance/', student_views.student_attendance),
    path('student/results/', student_views.student_results),
    path('student/profile/', student_views.student_profile),
    path('students/<int:pk>/reset-password/', student_views.reset_student_password),
    path('students/<int:pk>/inform-parent/', student_views.inform_parent_risk),

    # Class Discussion (Moderated Subject Q&A)
    path('discussion/threads/', discussion_views.discussion_threads),
    path('discussion/threads/<int:pk>/', discussion_views.discussion_thread_detail),
    path('discussion/threads/<int:pk>/reply/', discussion_views.discussion_thread_reply),
    path('discussion/threads/<int:pk>/accept/', discussion_views.discussion_thread_accept),
    path('discussion/threads/<int:pk>/lock/', discussion_views.discussion_thread_lock),
    path('discussion/threads/<int:pk>/hide/', discussion_views.discussion_thread_hide),
    path('discussion/posts/<int:pk>/hide/', discussion_views.discussion_post_hide),
    path('discussion/reports/', discussion_views.discussion_reports),
    path('discussion/reports/<int:pk>/resolve/', discussion_views.discussion_report_resolve),
    path('discussion/students/<int:student_id>/mute/', discussion_views.discussion_student_mute),

    # Psychological Evaluation Module (School-Based Behavioural & Developmental Profile)
    path('psychological-evaluations/template/', psychological_evaluation_views.evaluation_template_view),
    path('psychological-evaluations/overview/', psychological_evaluation_views.hierarchical_overview),
    path('psychological-evaluations/class-summary/', psychological_evaluation_views.class_evaluation_summary),
    path('psychological-evaluations/student-profile/<int:student_id>/', psychological_evaluation_views.student_profile_view),
    path('psychological-evaluations/my-profile/', psychological_evaluation_views.student_my_profile_view),
    path('psychological-evaluations/workspace/', psychological_evaluation_views.teacher_workspace_view),
    path('psychological-evaluations/evaluations/find/', psychological_evaluation_views.get_evaluation_detail),
    path('psychological-evaluations/evaluations/save/', psychological_evaluation_views.save_evaluation_view),
    path('psychological-evaluations/evaluations/<int:pk>/revise/', psychological_evaluation_views.revise_evaluation_view),
    path('psychological-evaluations/publications/publish/', psychological_evaluation_views.publish_evaluation_view),
    path('psychological-evaluations/safeguarding/refer/', psychological_evaluation_views.create_safeguarding_referral),
    path('psychological-evaluations/safeguarding/list/', psychological_evaluation_views.list_safeguarding_referrals),
    path('psychological-evaluations/gender-analytics/', psychological_evaluation_views.gender_analytics_view),
    path('psychological-evaluations/audit-logs/', psychological_evaluation_views.evaluation_audit_logs_view),
    path('psychological-evaluations/export/', psychological_evaluation_views.export_evaluations_csv),

    
    # Parent Management (Principal & Org Admin)
    path('parents/', parent_views.parent_list),
    path('parents/check-duplicate/', parent_views.parent_check_duplicate),
    path('parents/register/', parent_views.parent_register),
    path('parents/export/', parent_views.parent_export),
    path('parents/<int:pk>/', parent_views.parent_detail),
    path('parents/<int:pk>/reveal-identity/', parent_views.parent_reveal_identity),
    path('parents/<int:pk>/link-child/', parent_views.parent_link_child),
    path('parents/<int:pk>/revoke-relationship/<int:rel_id>/', parent_views.parent_revoke_relationship),
    path('parents/<int:pk>/relationships/<int:rel_id>/', parent_views.parent_update_relationship),
    path('parents/<int:pk>/suspend/', parent_views.parent_suspend),
    path('parents/<int:pk>/reset-password/', parent_views.parent_reset_password),

    # Parent Portal (Self-Service for Parents)
    path('parent/home/', parent_views.parent_home),
    path('parent/children/<int:student_id>/overview/', parent_views.parent_child_overview),
    path('parent/children/<int:student_id>/results/', parent_views.parent_child_results),
    path('parent/children/<int:student_id>/attendance/', parent_views.parent_child_attendance),
    path('parent/children/<int:student_id>/risk-and-support/', parent_views.parent_child_risk_and_support),
    path('parent/alerts/<int:alert_id>/acknowledge/', parent_views.parent_acknowledge_alert),
    path('parent/children/<int:student_id>/teachers/', parent_views.parent_child_teachers),
    path('parent/children/<int:student_id>/callback-request/', parent_views.parent_create_callback),
    path('parent/children/<int:student_id>/homework/', parent_views.parent_child_homework),
    path('parent/children/<int:student_id>/fees/', parent_views.parent_child_fees),
    path('parent/children/<int:student_id>/report-card/', parent_views.parent_child_report_card),
    path('parent/notifications/', parent_views.parent_notifications_list),
    path('parent/notifications/<int:pk>/read/', parent_views.parent_notification_mark_read),
    path('parent/notification-preferences/', parent_views.parent_notification_preferences),

    path('', include(r.urls))

]

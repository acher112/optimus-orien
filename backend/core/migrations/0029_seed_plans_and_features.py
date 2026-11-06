# Generated migration for seeding default Plans, Feature Catalog, and Platform Billing Settings

import django.db.models.deletion
from decimal import Decimal
from django.db import migrations


def seed_subscription_data(apps, schema_editor):
    Plan = apps.get_model('core', 'Plan')
    FeatureCatalog = apps.get_model('core', 'FeatureCatalog')
    PlanFeature = apps.get_model('core', 'PlanFeature')
    PlatformBillingSettings = apps.get_model('core', 'PlatformBillingSettings')

    # 1. Platform Billing Settings (Singleton)
    PlatformBillingSettings.objects.get_or_create(
        id=1,
        defaults={
            'bank_name': '',
            'account_title': '',
            'account_number': '',
            'iban': '',
            'branch_code': '',
            'swift_bic': '',
            'payment_instructions_en': '',
            'payment_instructions_ur': '',
            'default_trial_days': 0,
            'pending_grace_days': 3,
            'past_due_grace_days': 7,
            'yearly_discount_percentage': Decimal('0.00'),
            'exchange_rate_note_en': 'PKR amounts are approximate and based on standard currency conversion estimates.',
            'exchange_rate_note_ur': 'روپے کی رقم تخمینی ہے اور معیاری شرح تبادلہ کے تخمینے پر مبنی ہے۔',
        }
    )

    # 2. Plans
    standard_plan, _ = Plan.objects.get_or_create(
        code='standard',
        defaults={
            'name': 'Standard Plan',
            'name_ur': 'اسٹینڈرڈ پلان',
            'tagline': 'Essential Academic & Operations Suite',
            'tagline_ur': 'بنیادی تعلیمی اور انتظامی نظام',
            'description': 'Core school operations, daily attendance, grading, offline fees, student and parent portals, basic analytics.',
            'description_ur': 'بنیادی اسکول مینجمنٹ، روزانہ حاضری، امتحانات، نتائج، فیس چالان اور پورٹلز۔',
            'price_usd_per_student': Decimal('3.60'),
            'price_pkr_per_student': Decimal('1000.00'),
            'is_active': True,
            'display_order': 1,
        }
    )

    premium_plan, _ = Plan.objects.get_or_create(
        code='premium',
        defaults={
            'name': 'Premium Plan',
            'name_ur': 'پریمیم پلان',
            'tagline': 'Advanced Intelligence & Comprehensive Analytics',
            'tagline_ur': 'جامع اور جدید ترین تعلیمی و مالیاتی انٹیلی جنس',
            'description': 'All Standard features plus Academic Quality Index (AQI), early interventions, attention indicators, multi-campus governance, HR payroll, accounts ledger, advanced exports, and priority support.',
            'description_ur': 'اسٹینڈرڈ کی تمام خصوصیات کے ساتھ تعلیمی معیار انڈیکس (AQI)، قبل از وقت رہنمائی، پے رول، لیجر اور کثیر کیمپس انتظام۔',
            'price_usd_per_student': Decimal('7.20'),
            'price_pkr_per_student': Decimal('2000.00'),
            'is_active': True,
            'display_order': 2,
        }
    )

    # 3. Features Catalog
    features = [
        # Standard features
        ('school_setup', 'School Setup & Profile', 'اسکول سیٹ اپ', 'School profile, academic years, classes, and onboarding configuration.', 'اسکول پروفائل اور بنیادی سیٹ اپ', 'core', 'available', False, 1),
        ('single_campus', 'Single Campus Management', 'ایک کیمپس انتظام', 'Single campus administration and classroom directory.', 'ایک کیمپس کا انتظام', 'core', 'available', False, 2),
        ('people_accounts', 'Student & Staff Account Management', 'طلباء اور عملہ کے اکاؤنٹس', 'Student admissions, staff directories, and account credentials.', 'طلباء اور عملہ کے ریکارڈز', 'core', 'available', False, 3),
        ('csv_import', 'CSV Bulk Data Import', 'سی ایس وی ڈیٹا درآمد', 'Bulk import students, staff, and initial historical records.', 'سی ایس وی فائل سے بلک درآمد', 'core', 'available', False, 4),
        ('roles_permissions', 'Roles & Permissions Matrix', 'کردار اور اجازت نامے', 'Role-based access control across administration, teachers, and staff.', 'اجازت ناموں کا نظام', 'core', 'available', False, 5),
        ('attendance_daily', 'Daily Attendance Tracking', 'روزانہ حاضری', 'Daily student attendance recording with present/absent/late status.', 'روزانہ حاضری کا اندراج', 'academics', 'available', False, 6),
        ('marks_grading', 'Marks Entry & Grading Criteria', 'نمبرات اور گریڈنگ', 'Subject marks recording, custom grading formulas, and weightages.', 'امتحانی نمبرات اور گریڈنگ', 'academics', 'available', False, 7),
        ('exams_datesheets', 'Exam Datesheets & Timetables', 'امتحانی ڈیٹ شیٹ', 'Exam session scheduling, datesheets, and subject papers.', 'امتحانی شیڈول اور ڈیٹ شیٹس', 'academics', 'available', False, 8),
        ('result_cards', 'Result Cards & Term Slips', 'نتائج کے کارڈز', 'Student report cards, transcripts, and term progress summaries.', 'نتائج اور پروانہ جات', 'academics', 'available', False, 9),
        ('timetable', 'Class Timetable Scheduling', 'ٹائم ٹیبل انتظام', 'Weekly class, subject, and teacher period timetables.', 'ہفتہ وار ٹائم ٹیبل', 'academics', 'available', False, 10),
        ('fees_offline', 'Offline Fees & Counter Receipts', 'فیس چالان اور وصولی', 'Fee structures, vouchers, challans, counter collection, receipts, and defaulters.', 'فیس چالان، رسیدیں اور نادہندگان', 'finance', 'available', False, 11),
        ('tasks_homework', 'Tasks & Homework Assignments', 'ہوم ورک اور اسائنمنٹس', 'Homework publishing, due date management, and student submissions.', 'ہوم ورک اور ٹاسک مینجمنٹ', 'academics', 'available', False, 12),
        ('notices', 'Circulars & Announcements', 'اعلانات اور نوٹسز', 'Institution-wide notices, event circulars, and notifications.', 'اسکول کے اعلانات', 'operations', 'available', False, 13),
        ('portals_basic', 'Basic Portals (Teacher, Student, Parent, Principal)', 'بنیادی پورٹلز', 'Dedicated portals for teachers, students, parents, and principals.', 'اساتذہ، طلباء، والدین اور پرنسپل کے پورٹلز', 'core', 'available', False, 14),
        ('class_subject_performance', 'Class & Subject Academic Performance', 'کلاس اور مضمون کی کارکردگی', 'Class-level and subject-level average marks and attainment metrics.', 'مضامین کی کارکردگی کا جائزہ', 'analytics', 'available', False, 15),
        ('trends_basic', 'Current & Previous Term Trends', 'بنیادی تعلیمی رجحانات', 'Term-over-term and year-over-year performance trend charts.', 'تعلیمی رجحانات کا تقابل', 'analytics', 'available', False, 16),
        ('participation_skills_entry', 'Skills & Participation Entry', 'سرگرمیاں اور صلاحیتوں کا اندراج', 'Co-curricular participation and skills observation entry.', 'غیر نصابی سرگرمیوں کا اندراج', 'academics', 'available', False, 17),
        ('basic_reports_csv', 'Basic CSV Data Exports', 'سی ایس وی رپورٹس', 'Standard tabular CSV export for student lists, attendance, and basic fee rolls.', 'سی ایس وی برآمدات', 'operations', 'available', False, 18),
        ('english_urdu', 'Bilingual English & Urdu Localization', 'اردو اور انگریزی سپورٹ', 'Native right-to-left Urdu localization alongside English.', 'مکمل اردو اور انگریزی انٹرفیس', 'core', 'available', False, 19),

        # Premium features
        ('aqi', 'Academic Quality Index (AQI)', 'تعلیمی معیار کا اشاریہ', 'Multi-factor Academic Quality Index score engine and distribution.', 'اے کیو آئی انڈیکس اور تجزیہ', 'analytics', 'available', True, 20),
        ('aqi_history', 'Longitudinal AQI Trends', 'تاریخی اے کیو آئی رجحانات', 'Historical tracking of AQI progression over multiple academic terms.', 'تاریخی اے کیو آئی رجحانات', 'analytics', 'available', True, 21),
        ('early_intervention', 'Early Intervention & Support Cases', 'ابتدائی مداخلت کے کیسز', 'Risk identification workflow, case management, and remediation actions.', 'طلباء کی مدد اور انٹروینشن کیسز', 'analytics', 'available', True, 22),
        ('attention_indicators', 'Student Attention Indicators', 'توجہ اور خطرے کے اشاریے', 'Early behavioural, attendance, and academic risk flags.', 'خطرے کے اشاریے اور وارننگز', 'analytics', 'available', True, 23),
        ('automated_alerts', 'Automated Academic & Attendance Alerts', 'خودکار تعلیمی انتباہات', 'Automated threshold trigger alerts for parents and staff.', 'خودکار ایس ایم ایس اور ای میل الرٹس', 'operations', 'available', True, 24),
        ('longitudinal_5y', '5-Year Longitudinal Student Progress', 'پانچ سالہ تفصیلی تجزیہ', 'Multi-year student cohort tracking and long-range development analysis.', 'پانچ سالہ تعلیمی ارتقاء', 'analytics', 'available', True, 25),
        ('skills_analytics', 'Holistic Skills & Competency Analytics', 'مہارتوں کا جامع تجزیہ', 'Holistic competency evaluations across behavioural and cognitive skills.', 'مہارتوں اور صلاحیتوں کا جائزہ', 'analytics', 'available', True, 26),
        ('behaviour_analytics', 'Student Behavioural Analytics', 'رویہ کا تفصیلی تجزیہ', 'Behaviour incident tracking, positive affirmations, and trend analysis.', 'رویہ اور کردار کا تجزئیہ', 'safeguarding', 'available', True, 27),
        ('gender_equity_analytics', 'Gender Parity & Equity Reporting', 'صنفی برابری کا تجزیہ', 'Comparative analysis of boys and girls academic participation and attainment.', 'صنفی برابری اور تقابلی رپورٹس', 'analytics', 'available', True, 28),
        ('multi_campus', 'Multi-Campus Network Management', 'کثیر کیمپس انتظام', 'Centralized governance across multiple branch campuses within an organisation.', 'کثیر کیمپسز کا مرکزی انتظام', 'core', 'available', True, 29),
        ('campus_comparison', 'Cross-Campus Comparative Benchmarking', 'کیمپسز کا تقابلی جائزہ', 'Network-wide school and campus academic and fee benchmarking.', 'کیمپسز کے مابین کارکردگی کا تقابل', 'analytics', 'available', True, 30),
        ('advanced_class_intelligence', 'Advanced Class Intelligence', 'کلاس کی گہری بصیرت', 'Quantile distribution, bell curve analysis, and outlier detection.', 'کلاس کی تفصیلی انٹیلی جنس', 'analytics', 'available', True, 31),
        ('teacher_insights', 'Teacher Instructional Insights', 'اساتذہ کی کارکردگی کی بصیرت', 'Teacher instructional workload, evaluation completeness, and subject metrics.', 'اساتذہ کی کارکردگی اور رہنمائی', 'analytics', 'available', True, 32),
        ('advanced_reports_export', 'Formatted PDF & Excel Export Suite', 'پی ڈی ایف اور ایکسل برآمدات', 'High-fidelity ReportLab PDF dossiers and styled multi-tab Excel reports.', 'اعلیٰ معیار کی پی ڈی ایف اور ایکسل رپورٹس', 'operations', 'available', True, 33),
        ('accounts_ledger', 'Double-Entry Financial Accounts Ledger', 'کھاتہ جات اور لیجر', 'Chart of accounts, ledger entries, journal vouchers, and reconciliation.', 'مالیاتی لیجر اور جنرل جرنل', 'finance', 'available', True, 34),
        ('finance_dashboard', 'Executive Finance & Cashflow Dashboard', 'مالیاتی ڈیش بورڈ', 'Real-time revenue, dues, cashflow, and expense analytics.', 'مالیاتی صحت اور کیش فلو ڈیش بورڈ', 'finance', 'available', True, 35),
        ('hr_payroll', 'HR Staff Payroll & Salary Management', 'عملہ کی تنخواہیں اور پے رول', 'Salary structures, monthly payroll run, deductions, payslips, and disbursement.', 'عملہ کی تنخواہیں اور پے رول', 'finance', 'available', True, 36),
        ('admissions_online', 'Online Admissions & Applicant Funnel', 'آن لائن داخلے', 'Public student applicant registration, document verification, and admission approval.', 'آن لائن داخلہ فارم اور مراحل', 'operations', 'available', True, 37),
        ('transport_library_inventory', 'Transport, Library & Asset Inventory', 'ٹرانسپورٹ اور لائبریری', 'Fleet route allocation, book loans, and fixed asset tracking.', 'ٹرانسپورٹ، لائبریری اور اثاثہ جات', 'operations', 'available', True, 38),
        ('id_cards', 'Bulk Student & Staff ID Card Printing', 'شناختی کارڈ پرنٹنگ', 'Barcode/QR code PVC student and staff identity card generation.', 'طلباء اور عملہ کے شناختی کارڈز', 'operations', 'available', True, 39),
        ('psych_eval', 'Psychological Evaluation Module', 'نفسیاتی مشاہداتی نظام', 'School-based teacher observation framework (consent acknowledgement required).', 'اسکول پر مبنی مشاہداتی نظام (بمع رضامندی)', 'safeguarding', 'available', True, 40),
        ('audit_log_viewer', 'Security Audit Log Viewer & Export', 'آڈٹ لاگ معائنہ کار', 'Dedicated UI viewer and search console for school-level audit event trails.', 'سیکیورٹی آڈٹ لاگ معائنہ کار', 'operations', 'available', True, 41),
        ('priority_support', 'Priority SLA Technical Support', 'ترجیحی تکنیکی معاونت', 'Expedited ticket resolution and direct account manager assistance.', 'ترجیحی تکنیکی مدد اور معاونت', 'operations', 'available', True, 42),

        # Coming Soon features
        ('ai_assistant', 'AI Teaching Assistant & Exam Copilot', 'مصنوعی ذہانت کا معاون', 'AI-assisted lesson planning, quiz synthesis, and remediation suggestions.', 'مصنوعی ذہانت کا تعلیمی معاون', 'academics', 'coming_soon', True, 43),
        ('online_payments', 'Online Gateway Fee Collection', 'آن لائن فیس ادائیگی گیٹ وے', 'Direct credit card, 1Link, EasyPaisa, and JazzCash online checkout.', 'آن لائن فیس ادائیگی کے گیٹ ویز', 'finance', 'coming_soon', True, 44),
        ('sms_whatsapp_notifications', 'SMS & WhatsApp Gateway Notifications', 'ایس ایم ایس اور واٹس ایپ الرٹس', 'Telco SMS and WhatsApp business messaging for attendance and fees.', 'ایس ایم ایس اور واٹس ایپ پیغامات', 'operations', 'coming_soon', True, 45),
        ('public_leaderboards', 'Public Academic Leaderboards', 'عوامی تعلیمی لیڈر بورڈ', 'Cross-school academic competitions and verified public rankings.', 'عوامی تعلیمی چیلنجز اور رینکنگ', 'academics', 'coming_soon', True, 46),
    ]

    for key, name, name_ur, desc, desc_ur, cat, status, is_prem, order in features:
        FeatureCatalog.objects.update_or_create(
            key=key,
            defaults={
                'name': name,
                'name_ur': name_ur,
                'description': desc,
                'description_ur': desc_ur,
                'category': cat,
                'status': status,
                'is_premium_only': is_prem,
                'display_order': order,
            }
        )

    # 4. PlanFeature bindings
    standard_keys = [f[0] for f in features if not f[7] and f[6] != 'coming_soon']
    premium_keys = [f[0] for f in features if f[6] != 'coming_soon']

    for k in standard_keys:
        PlanFeature.objects.get_or_create(plan=standard_plan, feature_key=k, defaults={'is_included': True})
    for k in premium_keys:
        PlanFeature.objects.get_or_create(plan=premium_plan, feature_key=k, defaults={'is_included': True})


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0028_featurecatalog_plan_platformbillingsettings_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_subscription_data, reverse_code=reverse_seed),
    ]

import os
import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from django.apps import apps

logger = logging.getLogger('core')

class Command(BaseCommand):
    help = 'Safely wipe all registered schools, organizations, owners, students, and operational data while preserving core Plans and Billing settings.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Bypass interactive confirmation prompt',
        )
        parser.add_argument(
            '--recreate-admin',
            action='store_true',
            default=True,
            help='Recreate the default platform administrator after clearing (default: True)',
        )

    def handle(self, *args, **options):
        bypass = options.get('yes', False)

        if not bypass:
            self.stdout.write(self.style.WARNING(
                'WARNING: This operation will DELETE all registered schools, campuses, organisations, '
                'users/owners, students, classes, attendance, fees, and audit records from the active database!'
            ))
            confirm = input('Are you sure you want to proceed? Type "yes" to continue: ')
            if confirm.strip().lower() != 'yes':
                self.stdout.write(self.style.NOTICE('Operation aborted by user.'))
                return

        self.stdout.write('Clearing database records...')

        with transaction.atomic():
            # Get core models dynamically to avoid circular import issues
            Organisation = apps.get_model('core', 'Organisation')
            School = apps.get_model('core', 'School')
            User = apps.get_model('core', 'User')

            # Models to wipe in safe order
            models_to_clear = [
                'SubscriptionEvent',
                'SubscriptionOrder',
                'SchoolFeatureOverride',
                'SchoolSubscription',
                'OrganisationSubscription',
                'SupportAccessGrant',
                'UserInvitation',
                'AuditEvent',
                'Notification',
                'Announcement',
                'StudyMaterial',
                'HomeworkSubmission',
                'Homework',
                'Attendance',
                'StaffAttendance',
                'StaffEvent',
                'StaffMember',
                'FeePaymentAllocation',
                'FeePayment',
                'StudentFee',
                'Concession',
                'FeeStructure',
                'FeeHead',
                'SalaryAdjustment',
                'SalaryRecord',
                'SalaryStructure',
                'FinanceEntry',
                'FinanceCategory',
                'Grade',
                'AssessmentExemption',
                'Assessment',
                'CalculatedStudentResult',
                'CalculatedSubjectResult',
                'SubjectResult',
                'StudentOverallResult',
                'PublishedResult',
                'ResultPublicationHistory',
                'ExamMarkCorrection',
                'ExamStudentMark',
                'ExamSubjectWeight',
                'ExamComponentSubjectConfig',
                'ExamComponent',
                'ExamPaper',
                'ExamTerm',
                'TermSubjectMax',
                'ExamStructureVersion',
                'ExamStructure',
                'ExamSession',
                'GradingScale',
                'GradeBand',
                'AssessmentCategory',
                'ExamConfiguration',
                'Observation',
                'ReviewCase',
                'Intervention',
                'RiskCriteria',
                'RiskDismissal',
                'ParentCallbackRequest',
                'ParentRiskAlert',
                'ParentNotificationPreference',
                'GuardianRelationship',
                'GuardianProfile',
                'EvaluationSafeguardingReferral',
                'EvaluationAuditLog',
                'EvaluationPublication',
                'EvaluationDomainScore',
                'EvaluationResponse',
                'WeeklyEvaluation',
                'EvaluationQuestion',
                'EvaluationDimension',
                'EvaluationTemplate',
                'DiscussionReport',
                'DiscussionMute',
                'DiscussionPost',
                'DiscussionThread',
                'ClassTimetable',
                'HolidayCalendar',
                'RoleAssignment',
                'OrganisationRolePolicy',
                'RolePermission',
                'Enrollment',
                'Student',
                'ClassSubjectTeacher',
                'ClassTeacherAssignment',
                'TeachingAssignment',
                'ClassSubject',
                'Section',
                'SchoolClass',
                'Subject',
                'AcademicYear',
                'PublishedSchoolIndicator',
                'SchoolConfigurationVersion',
                'SchoolConfiguration',
                'BackgroundJob',
                'LandingContactMessage',
            ]

            cleared_counts = {}
            for model_name in models_to_clear:
                try:
                    m = apps.get_model('core', model_name)
                    count = m.objects.all().count()
                    if count > 0:
                        m.objects.all().delete()
                        cleared_counts[model_name] = count
                except LookupError:
                    continue
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Note on clearing {model_name}: {e}'))

            # Detach foreign keys on User to prevent ProtectedError
            User.objects.all().update(school=None, organisation=None)

            # Delete all non-admin or all users
            user_count = User.objects.all().count()
            User.objects.all().delete()

            # Delete all schools and organisations
            school_count = School.objects.all().count()
            School.objects.all().delete()

            org_count = Organisation.objects.all().count()
            Organisation.objects.all().delete()

            # Recreate default initial administrator so portal is immediately accessible
            admin_user = os.getenv('INITIAL_ADMIN_USERNAME', 'admin')
            admin_pass = os.getenv('INITIAL_ADMIN_PASSWORD', 'AdminPass123!')
            admin_email = os.getenv('INITIAL_ADMIN_EMAIL', 'admin@optimusorien.com')
            admin_org = os.getenv('INITIAL_ADMIN_ORG', 'Northstar Education Group')
            admin_school = os.getenv('INITIAL_ADMIN_SCHOOL', 'Northstar Academy')

            from core.services.bootstrap import ensure_admin
            admin = ensure_admin(
                username=admin_user,
                password=admin_pass,
                email=admin_email,
                org_name=admin_org,
                school_name=admin_school
            )

        self.stdout.write(self.style.SUCCESS('Successfully cleared database:'))
        self.stdout.write(f'  - Removed {school_count} schools')
        self.stdout.write(f'  - Removed {org_count} organisations')
        self.stdout.write(f'  - Removed {user_count} users')
        if admin:
            self.stdout.write(self.style.SUCCESS(
                f'  - Fresh administrator provisioned: username="{admin.username}", password="{admin_pass}"'
            ))
        self.stdout.write(self.style.SUCCESS('Database is clean and ready for fresh registrations.'))

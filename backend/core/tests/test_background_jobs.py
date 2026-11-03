from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from core.models import Organisation, School, User, Student, StudentFee, FeeHead, FinanceCategory, BackgroundJob
from core.services.job_runner import (
    enqueue_job, process_next_job, register_handler, MAX_CONCURRENT_JOBS_PER_SCHOOL
)

class BackgroundJobTests(TestCase):
    """
    Tests the zero-broker Render background worker architecture.
    Validates job execution, tenant context, retries, and per-school concurrency limits.
    """

    def setUp(self):
        self.org = Organisation.objects.create(name="Job Org", code="job-org", allow_org_admin_student_access=True)
        self.school = School.objects.create(name="Job School", code="SCH-JOB", organisation=self.org)
        self.admin = User.objects.create_user(
            username="job_admin", password="password123",
            role="organisation_admin", organisation=self.org, school=self.school
        )
        self.fcat = FinanceCategory.objects.create(school=self.school, name="Tuition", kind="income")
        self.fhead = FeeHead.objects.create(school=self.school, name="Tuition Fee", category=self.fcat)

        # Create 5 students
        for i in range(1, 6):
            Student.objects.create(
                school=self.school, admission_number=f"JOB-{i}",
                first_name=f"Student{i}", last_name="Job", father_name="Father",
                enrolled_on=date(2026, 8, 1), active=True
            )

    def test_enqueue_and_process_bulk_challan_job(self):
        """Worker executes bulk challan generation asynchronously and saves results."""
        payload = {
            'period': '2026-11',
            'head_id': self.fhead.id,
            'amount': '4500.00',
            'due_date': '2026-11-15'
        }
        job = enqueue_job(
            job_type='bulk_challan',
            payload=payload,
            school=self.school,
            user=self.admin
        )
        self.assertEqual(job.status, 'queued')
        self.assertEqual(job.school, self.school)
        self.assertEqual(job.organisation, self.org)
        self.assertEqual(job.created_by, self.admin)

        # Process the job
        processed = process_next_job()
        self.assertTrue(processed)

        # Check job completion state
        job.refresh_from_db()
        self.assertEqual(job.status, 'completed')
        self.assertEqual(job.attempts, 1)
        self.assertEqual(job.result.get('created_vouchers'), 5)
        self.assertIsNotNone(job.completed_at)

        # Verify StudentFee records were actually created
        self.assertEqual(StudentFee.objects.filter(head=self.fhead, period='2026-11').count(), 5)

    def test_retry_on_failure_and_permanent_fail(self):
        """Failing jobs retry with backoff up to max_attempts before marked failed."""
        call_count = 0

        @register_handler('test_fail_task')
        def failing_handler(j):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("Transient connection error")

        job = enqueue_job('test_fail_task', {}, school=self.school, user=self.admin)

        # Attempt 1
        process_next_job()
        job.refresh_from_db()
        self.assertEqual(job.attempts, 1)
        self.assertEqual(job.status, 'queued') # Re-scheduled
        self.assertIn("Transient connection error", job.error_message)

        # Manually reset scheduled_at to test immediate attempt 2 & 3
        job.scheduled_at = timezone.now() - timedelta(seconds=1)
        job.save()

        # Attempt 2
        process_next_job()
        job.refresh_from_db()
        self.assertEqual(job.attempts, 2)
        self.assertEqual(job.status, 'queued')

        job.scheduled_at = timezone.now() - timedelta(seconds=1)
        job.save()

        # Attempt 3 (Final attempt)
        process_next_job()
        job.refresh_from_db()
        self.assertEqual(job.attempts, 3)
        self.assertEqual(job.status, 'failed') # Permanently failed
        self.assertIsNotNone(job.completed_at)

    def test_per_school_concurrency_limit(self):
        """When a school hits its concurrent job limit, other schools' jobs take priority."""
        school_b = School.objects.create(name="School Beta", code="SCH-B", organisation=self.org)

        # Simulate 2 already running jobs for school A
        BackgroundJob.objects.create(school=self.school, job_type='report_card_pdf', status='running')
        BackgroundJob.objects.create(school=self.school, job_type='report_card_pdf', status='running')

        # School A queues a third job (should be throttled)
        job_a3 = enqueue_job('report_card_pdf', {'student_id': 99}, school=self.school)

        # School B queues a job (should run)
        job_b1 = enqueue_job('report_card_pdf', {'student_id': 100}, school=school_b)

        # Process next job
        process_next_job()

        job_b1.refresh_from_db()
        job_a3.refresh_from_db()

        # School B job should have run because School A was at capacity
        self.assertEqual(job_b1.status, 'completed')
        self.assertEqual(job_a3.status, 'queued')

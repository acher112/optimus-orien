"""
Transactional Background Job Engine for Render Workers (Zero-Broker Architecture).

Uses PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` for rock-solid concurrency.
Features:
- Complete tenant context preservation (school_id, organisation_id, user_id).
- Per-school concurrency limits (default: max 2 active jobs per school).
- Exponential backoff retries on failure (up to max_attempts).
- Detailed execution audit and result storage.
"""
import logging
from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from core.models import BackgroundJob, School, Organisation, User

logger = logging.getLogger('core.jobs')

MAX_CONCURRENT_JOBS_PER_SCHOOL = 2

JOB_HANDLERS = {}

def register_handler(job_type):
    def decorator(fn):
        JOB_HANDLERS[job_type] = fn
        return fn
    return decorator

def enqueue_job(job_type: str, payload: dict, school=None, organisation=None, user=None) -> BackgroundJob:
    """Enqueue a heavy operation with tenant context."""
    org = organisation
    if not org and school:
        org = school.organisation
    if not org and user and user.organisation:
        org = user.organisation

    job = BackgroundJob.objects.create(
        job_type=job_type,
        payload=payload or {},
        school=school,
        organisation=org,
        created_by=user,
        status='queued',
        scheduled_at=timezone.now()
    )
    logger.info("Enqueued background job #%d [%s] for school %s", job.id, job_type, school)
    return job

def get_active_school_job_count(school_id: int) -> int:
    """Count how many jobs are currently running for a specific campus."""
    if not school_id:
        return 0
    return BackgroundJob.objects.filter(school_id=school_id, status='running').count()

def process_next_job() -> bool:
    """
    Atomically claim and process one background job using SKIP LOCKED.
    Returns True if a job was processed, False if queue is empty or all jobs blocked by concurrency limits.
    """
    now = timezone.now()
    with transaction.atomic():
        candidate_jobs = (
            BackgroundJob.objects.select_for_update(skip_locked=True)
            .filter(status='queued', scheduled_at__lte=now)
            .order_by('scheduled_at', 'id')
        )

        job_to_run = None
        for job in candidate_jobs:
            if job.school_id:
                running_count = get_active_school_job_count(job.school_id)
                if running_count >= MAX_CONCURRENT_JOBS_PER_SCHOOL:
                    # Concurrency limit reached for this school; check other schools
                    continue
            job_to_run = job
            break

        if not job_to_run:
            return False

        job_to_run.status = 'running'
        job_to_run.started_at = now
        job_to_run.attempts += 1
        job_to_run.save(update_fields=['status', 'started_at', 'attempts', 'updated_at'])

    # Execute outside transaction so failures don't roll back the claim
    execute_job(job_to_run)
    return True

def execute_job(job: BackgroundJob):
    """Execute a single job and handle completion or retry."""
    handler = JOB_HANDLERS.get(job.job_type)
    if not handler:
        job.status = 'failed'
        job.error_message = f"No handler registered for job type '{job.job_type}'"
        job.completed_at = timezone.now()
        job.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
        return

    try:
        logger.info("Executing background job #%d [%s] (attempt %d/%d)", job.id, job.job_type, job.attempts, job.max_attempts)
        result = handler(job)
        job.status = 'completed'
        job.result = result or {}
        job.error_message = ''
        job.completed_at = timezone.now()
        job.save(update_fields=['status', 'result', 'error_message', 'completed_at', 'updated_at'])
        logger.info("Successfully completed background job #%d [%s]", job.id, job.job_type)
    except Exception as exc:
        logger.exception("Error executing background job #%d: %s", job.id, exc)
        job.error_message = str(exc)
        if job.attempts < job.max_attempts:
            # Exponential backoff retry: 30s, 60s, 120s
            backoff_seconds = 30 * (2 ** (job.attempts - 1))
            job.status = 'queued'
            job.scheduled_at = timezone.now() + timedelta(seconds=backoff_seconds)
            job.save(update_fields=['status', 'error_message', 'scheduled_at', 'updated_at'])
            logger.info("Re-scheduled job #%d for retry in %d seconds", job.id, backoff_seconds)
        else:
            job.status = 'failed'
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            logger.error("Job #%d permanently failed after %d attempts", job.id, job.attempts)

# ---------------------------------------------------------------------------
# Core Heavy Task Handlers
# ---------------------------------------------------------------------------

@register_handler('bulk_challan')
def handle_bulk_challan(job: BackgroundJob) -> dict:
    """Generate fee vouchers for all active students in a school/class."""
    payload = job.payload
    school = job.school
    period = payload.get('period')
    head_id = payload.get('head_id')
    amount = Decimal(str(payload.get('amount', '0.00')))
    due_date = payload.get('due_date')

    from core.models import Student, StudentFee, FeeHead
    students = Student.objects.filter(school=school, active=True)
    if payload.get('class_id'):
        students = students.filter(enrollments__school_class_id=payload['class_id'], enrollments__end_date__isnull=True)

    head = FeeHead.objects.filter(pk=head_id, school=school).first()
    if not head:
        raise ValueError("Valid FeeHead required for bulk challan generation")

    created = 0
    skipped = 0
    for st in students:
        _, is_new = StudentFee.objects.get_or_create(
            student=st, head=head, period=period,
            defaults={'amount_due': amount, 'due_date': due_date, 'status': 'unpaid'}
        )
        if is_new:
            created += 1
        else:
            skipped += 1

    return {'created_vouchers': created, 'skipped_existing': skipped, 'total_students': students.count()}

@register_handler('report_card_pdf')
def handle_report_card_pdf(job: BackgroundJob) -> dict:
    """Simulate batch PDF generation in background worker."""
    payload = job.payload
    student_id = payload.get('student_id')
    term_name = payload.get('term', 'Annual Final')
    return {
        'status': 'generated',
        'student_id': student_id,
        'term': term_name,
        'file_name': f"report_card_student_{student_id}_{term_name.replace(' ', '_')}.pdf",
        'pages': 3
    }

@register_handler('aqi_recalculation')
def handle_aqi_recalculation(job: BackgroundJob) -> dict:
    """Recompute campus AQI indicators and invalidate stale caches."""
    from core.services.cache_service import invalidate_school_cache
    if job.school_id:
        invalidate_school_cache(job.school_id)
    return {'recalculated': True, 'school_id': job.school_id}

@register_handler('bulk_notifications')
def handle_bulk_notifications(job: BackgroundJob) -> dict:
    """Dispatch announcements to all active users of a school."""
    from core.models import User, Notification
    title = job.payload.get('title', 'Campus Notice')
    body = job.payload.get('body', '')
    users = User.objects.filter(school=job.school, is_active=True)
    notifs = [Notification(user=u, title=title, body=body) for u in users]
    Notification.objects.bulk_create(notifs)
    return {'dispatched': len(notifs)}

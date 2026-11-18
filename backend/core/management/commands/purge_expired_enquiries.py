"""Idempotent Management Command: purge_expired_enquiries

Purges public parent enquiries that have exceeded their 90-day retention schedule.
Runs idempotently without background queues.
"""
from django.core.management.base import BaseCommand
from core.services.public_directory_service import purge_expired_enquiries


class Command(BaseCommand):
    help = "Purges parent enquiries older than the configured retention schedule (default 90 days)."

    def handle(self, *args, **options):
        self.stdout.write("Purging expired parent directory enquiries...")
        deleted_count = purge_expired_enquiries()
        self.stdout.write(
            self.style.SUCCESS(f"Successfully purged {deleted_count} expired enquiry record(s).")
        )

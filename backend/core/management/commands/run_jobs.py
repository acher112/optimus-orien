import time
import signal
import sys
from django.core.management.base import BaseCommand
from core.services.job_runner import process_next_job

class Command(BaseCommand):
    help = "Run the OPTIMUS ORIEN background job worker (Render worker service)."

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Process currently queued jobs once and exit')
        parser.add_argument('--max-jobs', type=int, default=0, help='Maximum number of jobs to execute before exiting')
        parser.add_argument('--interval', type=float, default=1.0, help='Sleep seconds between queue polls')

    def handle(self, *args, **options):
        once = options['once']
        max_jobs = options['max_jobs']
        interval = options['interval']

        self.stdout.write(self.style.SUCCESS("Starting background job worker service..."))

        running = True
        def shutdown_handler(signum, frame):
            nonlocal running
            self.stdout.write(self.style.WARNING("Received shutdown signal. Finishing active job..."))
            running = False

        try:
            signal.signal(signal.SIGINT, shutdown_handler)
            signal.signal(signal.SIGTERM, shutdown_handler)
        except (ValueError, AttributeError):
            pass # Signals might differ on some platforms

        processed = 0
        while running:
            job_done = process_next_job()
            if job_done:
                processed += 1
                if max_jobs and processed >= max_jobs:
                    self.stdout.write(f"Reached max jobs limit ({max_jobs}). Exiting.")
                    break
            else:
                if once:
                    break
                time.sleep(interval)

        self.stdout.write(self.style.SUCCESS(f"Worker shutdown gracefully. Total jobs processed: {processed}"))

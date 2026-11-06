"""
Idempotent Management Command: sync_subscription_states
Advances time-based subscription transitions (trial expiry, grace period conclusion, past_due).
Evaluated without requiring Celery or Redis background brokers.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.services.entitlements import sync_all_subscription_states


class Command(BaseCommand):
    help = "Idempotently evaluates and advances subscription states whose deadlines have passed."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate evaluations without committing status changes.',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        now = timezone.now()
        self.stdout.write(f"Evaluating subscription states as of {now.isoformat()} (dry_run={dry_run})...")

        result = sync_all_subscription_states(now=now)
        self.stdout.write(
            self.style.SUCCESS(
                f"Evaluated {result['total_evaluated']} school subscriptions. "
                f"Applied {result['transitions_applied']} state transition(s)."
            )
        )

"""Idempotent Management Command: refresh_public_snapshots

Generates immutable platform-level performance snapshots and computes competition rankings
for all live and eligible campuses.
Runs without Celery or Redis.
"""
from django.core.management.base import BaseCommand
from core.services.public_directory_service import refresh_public_snapshots


class Command(BaseCommand):
    help = "Generates and refreshes public campus leaderboard snapshots and competition rankings."

    def add_arguments(self, parser):
        parser.add_argument(
            '--period',
            type=str,
            default='2025-2026 Term 2',
            help='Academic period name for this snapshot cycle (default: "2025-2026 Term 2")',
        )

    def handle(self, *args, **options):
        period = options.get('period', '2025-2026 Term 2')
        self.stdout.write(f"Refreshing public directory snapshots for period '{period}'...")

        result = refresh_public_snapshots(period_name=period)

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully processed {result['processed_count']} campuses. "
                f"{result['eligible_count']} ranked as eligible in period '{result['period_name']}'."
            )
        )

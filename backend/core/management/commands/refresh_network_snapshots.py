"""
Management command to recalculate and refresh immutable BoardSnapshots and BadgeAwards.
Usage:
  python manage.py refresh_network_snapshots [--period "2025-2026 Term 2"] [--year "2025-2026"]
"""
from django.core.management.base import BaseCommand
from core.services.network_ranking import refresh_network_snapshots_for_period


class Command(BaseCommand):
    help = "Recalculates board snapshots and awards badges for the Network feature."

    def add_arguments(self, parser):
        parser.add_argument(
            '--period',
            type=str,
            default='2025-2026 Term 2',
            help='Assessment period identifier (default: "2025-2026 Term 2")'
        )
        parser.add_argument(
            '--year',
            type=str,
            default='2025-2026',
            help='Academic year name (default: "2025-2026")'
        )

    def handle(self, *args, **options):
        period = options['period']
        year = options['year']
        self.stdout.write(f"Refreshing network snapshots for period '{period}' (Year: {year})...")

        res = refresh_network_snapshots_for_period(period_identifier=period, academic_year_name=year)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully refreshed snapshots:\n"
            f" - Principals: {res['principals_count']}\n"
            f" - Teachers:   {res['teachers_count']}\n"
            f" - Students:   {res['students_count']}\n"
            f" - Badge Awards: {res['badge_awards_count']}"
        ))

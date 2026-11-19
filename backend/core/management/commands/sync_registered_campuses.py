"""Management Command: sync_registered_campuses

Ensures all registered campuses in School are synced to live public listings
with resolved locations, principals, and calculated academic quality snapshots.
"""
from django.core.management.base import BaseCommand
from core.services.public_directory_service import ensure_all_registered_campuses_synced


class Command(BaseCommand):
    help = "Syncs all registered campuses into the public schools directory and leaderboard."

    def handle(self, *args, **options):
        self.stdout.write("Synchronizing all registered campuses into public directory...")
        count = ensure_all_registered_campuses_synced()
        self.stdout.write(
            self.style.SUCCESS(f"Successfully synchronized {count} registered campus listings and snapshots.")
        )

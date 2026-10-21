import os
from django.core.management.base import BaseCommand
from core.services.bootstrap import ensure_admin

class Command(BaseCommand):
    help = 'Idempotently create or verify an initial administrator account using environment variables'

    def handle(self, *args, **kwargs):
        username = os.getenv('INITIAL_ADMIN_USERNAME')
        password = os.getenv('INITIAL_ADMIN_PASSWORD')
        email = os.getenv('INITIAL_ADMIN_EMAIL', '')
        org_name = os.getenv('INITIAL_ADMIN_ORG', 'Northstar Education Group')
        school_name = os.getenv('INITIAL_ADMIN_SCHOOL', 'Northstar Academy')

        if not username or not password:
            self.stdout.write(self.style.WARNING(
                'INITIAL_ADMIN_USERNAME or INITIAL_ADMIN_PASSWORD not set. Skipping initial admin creation.'
            ))
            return

        user = ensure_admin(username, password, email=email, org_name=org_name, school_name=school_name)
        if user:
            self.stdout.write(self.style.SUCCESS(f'Admin user "{username}" is ready (role: {user.role}).'))
        else:
            self.stdout.write(self.style.ERROR('Failed to ensure admin user.'))

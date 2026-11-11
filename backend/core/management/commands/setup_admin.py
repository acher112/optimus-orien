import os
from django.core.management.base import BaseCommand
from core.services.bootstrap import ensure_admin

class Command(BaseCommand):
    help = 'Idempotently create or verify an initial administrator account using environment variables'

    def handle(self, *args, **kwargs):
        username = os.getenv('INITIAL_ADMIN_USERNAME')
        password = os.getenv('INITIAL_ADMIN_PASSWORD')
        user = ensure_admin(username, password, email=email)
        if user:
            self.stdout.write(self.style.SUCCESS(f'Admin user "{username}" is ready (role: {user.role}).'))
        else:
            self.stdout.write(self.style.ERROR('Failed to ensure admin user.'))

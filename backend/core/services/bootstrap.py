import logging
from django.db import transaction
from core.models import User, Organisation, School

logger = logging.getLogger('core')

@transaction.atomic
def ensure_admin(username='admin', password='AdminPass123!', email='admin@optimusorien.com', **kwargs):
    """
    Idempotent bootstrap utility to create or update the master platform administrator (Website Owner).
    No dummy school, organisation, or staff accounts are created.
    The platform admin is a standalone superuser (role='platform_admin', school=None, organisation=None).
    """
    username = (username or 'admin').strip()
    password = (password or 'AdminPass123!').strip()
    email = (email or 'admin@optimusorien.com').strip()
    if not username or not password:
        return None

    existing = User.objects.filter(username=username).first()
    if existing:
        existing.set_password(password)
        existing.email = email
        existing.is_active = True
        existing.is_staff = True
        existing.is_superuser = True
        existing.role = 'platform_admin'
        existing.organisation = None
        existing.school = None
        existing.save()
        logger.info(f'Platform administrator "{username}" updated successfully with active status.')
        return existing

    user = User.objects.create_superuser(
        username=username,
        email=email,
        password=password,
        role='platform_admin',
        organisation=None,
        school=None
    )
    logger.info(f'Initial platform administrator "{username}" created successfully without any dummy school.')
    return user

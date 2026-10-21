import logging
from django.db import transaction
from core.models import User, Organisation, School

logger = logging.getLogger('core')

@transaction.atomic
def ensure_admin(username, password, email='', org_name='Northstar Education Group', school_name='Northstar Academy'):
    """
    Idempotent bootstrap utility to create an initial administrator account
    from environment variables in serverless/free-tier hosting environments
    where interactive SSH/Shell access is unavailable.
    """
    if not username or not password:
        return None

    existing = User.objects.filter(username=username).first()
    if existing:
        # If user exists, update password and ensure active status matching environment config
        existing.set_password(password)
        existing.is_active = True
        existing.is_staff = True
        existing.is_superuser = True
        existing.role = 'organisation_admin'
        existing.save()
        logger.info(f'Administrator user "{username}" updated successfully with active status.')
        return existing

    org, _ = Organisation.objects.get_or_create(
        code='northstar',
        defaults={'name': org_name, 'allow_org_admin_student_access': True}
    )
    if not org.allow_org_admin_student_access:
        org.allow_org_admin_student_access = True
        org.save(update_fields=['allow_org_admin_student_access'])

    school, _ = School.objects.get_or_create(
        organisation=org,
        code='NORTH',
        defaults={'name': school_name}
    )

    user = User.objects.create_superuser(
        username=username,
        email=email,
        password=password,
        role='organisation_admin',
        organisation=org,
        school=school
    )
    logger.info(f'Initial administrator "{username}" created successfully with organisation_admin role.')
    return user

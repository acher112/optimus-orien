import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config')
from django.core.wsgi import get_wsgi_application
application=get_wsgi_application()

# Safe one-time administrator bootstrap from private environment variables
_admin_user = os.getenv('INITIAL_ADMIN_USERNAME')
_admin_pass = os.getenv('INITIAL_ADMIN_PASSWORD')
if _admin_user and _admin_pass:
    try:
        from core.services.bootstrap import ensure_admin
        ensure_admin(
            username=_admin_user,
            password=_admin_pass,
            email=os.getenv('INITIAL_ADMIN_EMAIL', ''),
            org_name=os.getenv('INITIAL_ADMIN_ORG', 'Northstar Education Group'),
            school_name=os.getenv('INITIAL_ADMIN_SCHOOL', 'Northstar Academy')
        )
    except Exception as _e:
        import logging
        logging.getLogger('core').warning(f'Initial admin bootstrap skipped: {_e}')

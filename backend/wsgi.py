import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config')
from django.core.wsgi import get_wsgi_application
application=get_wsgi_application()

# Safe auto-migration on deployment startup for containerized environments (Render)
try:
    from django.core.management import call_command
    call_command('migrate', interactive=False)
except Exception as _mig_err:
    import logging
    logging.getLogger('core').warning(f'Startup auto-migration notice: {_mig_err}')

# Safe one-time administrator bootstrap from private environment variables
_admin_user = os.getenv('INITIAL_ADMIN_USERNAME')
_admin_pass = os.getenv('INITIAL_ADMIN_PASSWORD')
if _admin_user and _admin_pass:
    try:
        from core.services.bootstrap import ensure_admin
        ensure_admin(
            username=_admin_user,
            password=_admin_pass,
            email=os.getenv('INITIAL_ADMIN_EMAIL', 'admin@optimusorien.com')
        )
    except Exception as _e:
        import logging
        logging.getLogger('core').warning(f'Initial admin bootstrap skipped: {_e}')

import os
from pathlib import Path
from dotenv import load_dotenv
BASE_DIR=Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent/'.env')
SECRET_KEY=os.getenv('DJANGO_SECRET_KEY','dev-only-change-before-production')
DEBUG=os.getenv('DJANGO_DEBUG','false').lower()=='true'
ALLOWED_HOSTS=[h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS','localhost,127.0.0.1').split(',') if h.strip()]
for _h in ('localhost','127.0.0.1','.onrender.com','testserver'):
 if _h not in ALLOWED_HOSTS:ALLOWED_HOSTS.append(_h)
if not DEBUG and (SECRET_KEY in ('dev-only-change-before-production','change-this-to-a-long-random-secret','local-development-only-optimus-orien-not-production') or len(SECRET_KEY)<32):
 raise RuntimeError('DJANGO_SECRET_KEY must be strong and unique when DJANGO_DEBUG=false')
INSTALLED_APPS=['django.contrib.admin','django.contrib.auth','django.contrib.contenttypes','django.contrib.sessions','django.contrib.messages','django.contrib.staticfiles','rest_framework','corsheaders','core']
MIDDLEWARE=['django.middleware.security.SecurityMiddleware','corsheaders.middleware.CorsMiddleware','django.contrib.sessions.middleware.SessionMiddleware','django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.contrib.auth.middleware.AuthenticationMiddleware','django.contrib.messages.middleware.MessageMiddleware','django.middleware.clickjacking.XFrameOptionsMiddleware','core.middleware.SlowQueryAndPerformanceMiddleware']
ROOT_URLCONF='urls'
TEMPLATES=[{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':['django.template.context_processors.debug','django.template.context_processors.request','django.contrib.auth.context_processors.auth','django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION='wsgi.application'
if os.getenv('POSTGRES_DB') or os.getenv('DATABASE_URL'):
    db_config = {
        'ENGINE': 'django.db.backends.postgresql',
        'CONN_MAX_AGE': int(os.getenv('CONN_MAX_AGE', '0')),
        'DISABLE_SERVER_SIDE_CURSORS': True,
        'OPTIONS': {
            'connect_timeout': int(os.getenv('DB_CONNECT_TIMEOUT', '10')),
            'keepalives': 1,
            'keepalives_idle': 30,
            'keepalives_interval': 10,
            'keepalives_count': 5,
        }
    }
    if os.getenv('DATABASE_URL'):
        import urllib.parse as _up
        _url = _up.urlparse(os.environ['DATABASE_URL'])
        db_config['NAME'] = _url.path[1:]
        db_config['USER'] = _url.username
        db_config['PASSWORD'] = _url.password or ''
        db_config['HOST'] = _url.hostname
        db_config['PORT'] = _url.port or 5432
    else:
        db_config['NAME'] = os.environ['POSTGRES_DB']
        db_config['USER'] = os.getenv('POSTGRES_USER', 'postgres')
        db_config['PASSWORD'] = os.getenv('POSTGRES_PASSWORD', '')
        db_config['HOST'] = os.getenv('POSTGRES_HOST', 'localhost')
        db_config['PORT'] = os.getenv('POSTGRES_PORT', '5432')
    DATABASES = {'default': db_config}
else:
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
AUTH_PASSWORD_VALIDATORS=[{'NAME':'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},{'NAME':'django.contrib.auth.password_validation.MinimumLengthValidator'},{'NAME':'django.contrib.auth.password_validation.CommonPasswordValidator'},{'NAME':'django.contrib.auth.password_validation.NumericPasswordValidator'}]
AUTH_USER_MODEL='core.User'
REST_FRAMEWORK={'DEFAULT_AUTHENTICATION_CLASSES':['rest_framework.authentication.SessionAuthentication'],'DEFAULT_PERMISSION_CLASSES':['rest_framework.permissions.IsAuthenticated'],'DEFAULT_PAGINATION_CLASS':'core.pagination.StandardPagination','PAGE_SIZE':25,'DEFAULT_THROTTLE_CLASSES':['rest_framework.throttling.AnonRateThrottle'],'DEFAULT_THROTTLE_RATES':{'anon':'60/min','login':'10/min','signup':'10/hour','password_reset':'10/hour','heavy':'20/min'}}
DATA_UPLOAD_MAX_MEMORY_SIZE = 5242880  # 5MB max upload
FILE_UPLOAD_MAX_MEMORY_SIZE = 5242880  # 5MB max file
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000
_DEFAULT_ORIGINS='http://localhost:5173,https://optimus-orien.vercel.app,https://optimus-orien-api.onrender.com'
CORS_ALLOWED_ORIGINS=[o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS',_DEFAULT_ORIGINS).split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS=True
CSRF_TRUSTED_ORIGINS=[o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS',_DEFAULT_ORIGINS).split(',') if o.strip()]
for _origin in ('https://optimus-orien.vercel.app','https://optimus-orien-api.onrender.com'):
 if _origin not in CSRF_TRUSTED_ORIGINS:CSRF_TRUSTED_ORIGINS.append(_origin)
 if _origin not in CORS_ALLOWED_ORIGINS:CORS_ALLOWED_ORIGINS.append(_origin)
SESSION_COOKIE_HTTPONLY=True
SESSION_COOKIE_SECURE=not DEBUG
CSRF_COOKIE_SECURE=not DEBUG
SECURE_SSL_REDIRECT=(not DEBUG and os.getenv('DJANGO_SSL_REDIRECT','false' if os.getenv('RENDER') else 'true').lower()=='true')
SECURE_REDIRECT_EXEMPT=[r'^$',r'^health/?$',r'^api/health/?$',r'^health/ready/?$',r'^api/health/ready/?$']
SECURE_HSTS_SECONDS=31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS=not DEBUG
SECURE_REFERRER_POLICY='same-origin'
SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO','https') if (not DEBUG or os.getenv('TRUST_REVERSE_PROXY','true').lower()=='true' or os.getenv('RENDER')) else None
SESSION_COOKIE_SAMESITE='Lax'
CSRF_COOKIE_SAMESITE='Lax'
SESSION_EXPIRE_AT_BROWSER_CLOSE=True
SESSION_COOKIE_AGE=3600*8
SECURE_CONTENT_TYPE_NOSNIFF=True
X_FRAME_OPTIONS='DENY'
LANGUAGE_CODE='en-us'; TIME_ZONE='UTC'; USE_I18N=True; USE_TZ=True
STATIC_URL='static/'; STATIC_ROOT=BASE_DIR/'staticfiles'
DEFAULT_AUTO_FIELD='django.db.models.BigAutoField'
PRIVATE_STORAGE_ROOT=Path(os.getenv('PRIVATE_STORAGE_ROOT',str(BASE_DIR/'private_storage')))
os.makedirs(PRIVATE_STORAGE_ROOT,exist_ok=True)

LOGGING={'version':1,'disable_existing_loggers':False,'handlers':{'console':{'class':'logging.StreamHandler'}},'loggers':{'django.request':{'handlers':['console'],'level':'WARNING','propagate':False},'core':{'handlers':['console'],'level':'INFO','propagate':False}}}

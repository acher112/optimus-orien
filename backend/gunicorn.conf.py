"""
Gunicorn configuration for OPTIMUS ORIEN production deployment on Render.
Optimized for multi-tenant educational workloads, Neon connection pooling,
and graceful worker recycling.
"""
import os
import multiprocessing

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# Concurrency Model: 4 workers x 2 threads = 8 concurrent request slots per web node
# Stage 1 (1-10 schools): 2 nodes = 16 concurrent requests (~80-120 req/sec)
# Stage 2 (11-50 schools): 4 nodes = 32 concurrent requests (~200-300 req/sec)
workers = int(os.getenv('WEB_CONCURRENCY', '4'))
threads = int(os.getenv('GUNICORN_THREADS', '2'))
worker_class = 'gthread'
worker_connections = 1000

# Request Timeouts & Cold Start Tolerances
timeout = int(os.getenv('GUNICORN_TIMEOUT', '30'))  # Fail requests exceeding 30s
graceful_timeout = int(os.getenv('GUNICORN_GRACEFUL_TIMEOUT', '15'))
keepalive = int(os.getenv('GUNICORN_KEEPALIVE', '5'))

# Worker Memory Leak & State Hygiene
# Automatically recycle worker process after 1000 requests (with random jitter)
max_requests = 1000
max_requests_jitter = 100

# Neon / PgBouncer Transaction Pooling Compatibility:
# Do not preload application state to avoid sharing opened database socket handles across forks
preload_app = False

# Logging: Stream formatted request metrics to stdout
accesslog = '-'
errorlog = '-'
loglevel = os.getenv('GUNICORN_LOG_LEVEL', 'info')
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" (%(M)s ms)'

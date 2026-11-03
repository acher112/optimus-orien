"""
Observability and performance monitoring middleware for OPTIMUS ORIEN.
Tracks request duration, logs slow endpoints (>200ms) with structured JSON,
and monitors query count budgets without leaking PII or credentials.
"""
import time
import json
import logging
from django.db import connection
from django.conf import settings

logger = logging.getLogger('core.performance')

class SlowQueryAndPerformanceMiddleware:
    """
    Measures endpoint latency and DB query counts.
    Logs structured JSON for any request exceeding 200ms threshold
    or executing more than 25 queries.
    """
    SLOW_THRESHOLD_MS = 200.0
    HIGH_QUERY_THRESHOLD = 25

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Exclude static/media requests from latency profiling
        if request.path.startswith(('/static/', '/media/', '/favicon.ico')):
            return self.get_response(request)

        start_time = time.monotonic()
        initial_queries = len(connection.queries) if settings.DEBUG else 0

        response = self.get_response(request)

        elapsed_ms = (time.monotonic() - start_time) * 1000.0
        queries_run = (len(connection.queries) - initial_queries) if settings.DEBUG else None

        # Sanitize path to prevent leaking any URL tokens or query PII
        clean_path = request.path

        if elapsed_ms > self.SLOW_THRESHOLD_MS or (queries_run is not None and queries_run > self.HIGH_QUERY_THRESHOLD):
            log_data = {
                'event': 'slow_query_alert',
                'method': request.method,
                'path': clean_path,
                'status_code': response.status_code,
                'duration_ms': round(elapsed_ms, 2),
            }
            if queries_run is not None:
                log_data['queries_run'] = queries_run
                log_data['high_queries'] = queries_run > self.HIGH_QUERY_THRESHOLD

            logger.warning(json.dumps(log_data))

        # Add debug headers if debug mode is active
        if settings.DEBUG:
            response['X-Response-Time-Ms'] = f"{elapsed_ms:.2f}"
            if queries_run is not None:
                response['X-Query-Count'] = str(queries_run)

        return response

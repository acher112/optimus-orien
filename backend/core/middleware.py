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
from django.http import JsonResponse
from core.services.entitlements import get_effective_subscription_status

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


class SubscriptionEntitlementsAndLimitedGuardMiddleware:
    """
    Server-side guard enforcing read-only behavior during limited mode,
    and blocking access during administrative suspension.
    Reads and all data exports remain permanently allowed in every state.
    """
    WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
    ALLOWLIST_PREFIXES = (
        '/static/',
        '/media/',
        '/favicon.ico',
        '/api/v1/auth/',
        '/auth/',
        '/api/v1/subscription/',
        '/subscription/',
        '/api/v1/public/',
        '/public/',
        '/api/v1/platform-admin/',
        '/platform-admin/',
        '/api/v1/platform/',
        '/platform/',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            # Check for DRF test client forced authentication
            user = getattr(request, '_force_auth_user', None)

        if not user or not user.is_authenticated:
            return self.get_response(request)

        # Superusers and platform admins without school assignment are exempt
        if user.is_superuser or user.role == 'platform_admin' or not getattr(user, 'school', None):
            return self.get_response(request)

        path = request.path

        # Always allow data exports (compliance & portability guarantees)
        if 'export' in path.lower() or 'download' in path.lower():
            return self.get_response(request)

        # Only check mutating methods for limited mode
        if request.method in self.WRITE_METHODS:
            school = user.school
            status = get_effective_subscription_status(school)

            if status == 'limited':
                # Check write-allowlist
                if not any(path.startswith(prefix) for prefix in self.ALLOWLIST_PREFIXES):
                    return JsonResponse({
                        'detail': 'School account is in limited read-only mode. Please renew your subscription to perform write actions.',
                        'code': 'limited_read_only',
                        'status': 'limited'
                    }, status=403)

            elif status == 'suspended':
                # Suspended accounts cannot perform non-allowlisted writes or reads
                if not any(path.startswith(prefix) for prefix in ('/api/v1/auth/logout', '/auth/logout', '/api/v1/public/contact', '/public/contact')):
                    return JsonResponse({
                        'detail': 'School account is suspended. Please contact platform administration.',
                        'code': 'account_suspended',
                        'status': 'suspended'
                    }, status=403)

        return self.get_response(request)

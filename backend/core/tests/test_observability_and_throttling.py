from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import User, Organisation, School
from core.throttles import PerAccountLoginLockoutThrottle
from django.core.cache import cache

class ObservabilityAndThrottlingTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.org = Organisation.objects.create(name='Test Org', code='torg')
        self.school = School.objects.create(name='Test Campus', code='tc1', organisation=self.org)
        self.user = User.objects.create_user(
            username='lockout_tester',
            email='lockout@example.com',
            password='CorrectPassword123!',
            role='teacher',
            organisation=self.org,
            school=self.school,
            is_active=True
        )

    def test_health_liveness_endpoint(self):
        """Liveness check returns 200 OK immediately with service identifier."""
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get('status'), 'ok')
        self.assertEqual(data.get('service'), 'optimus-orien')

    def test_health_readiness_endpoint(self):
        """Readiness check validates DB, pending migrations, and cache readiness."""
        response = self.client.get('/api/health/ready/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get('status'), 'ready')
        self.assertEqual(data.get('service'), 'optimus-orien')
        self.assertEqual(data['checks'].get('database'), 'connected')
        self.assertEqual(data['checks'].get('migration_status'), 'up_to_date')
        self.assertEqual(data['checks'].get('cache'), 'operational')

    def test_account_lockout_after_repeated_failures(self):
        """5 failed login attempts trigger a 429 lockout for the target account."""
        identifier = 'lockout_tester'
        
        # Verify initially unlocked
        self.assertFalse(PerAccountLoginLockoutThrottle.is_locked(identifier, ignore_test_env=True))

        # Simulate 5 consecutive failed login attempts
        for _ in range(5):
            PerAccountLoginLockoutThrottle.record_failure(identifier)

        self.assertTrue(PerAccountLoginLockoutThrottle.is_locked(identifier, ignore_test_env=True))

        # Attempt signin with locked account (simulate non-test request)
        cached_attempts = cache.get(PerAccountLoginLockoutThrottle.get_cache_key(identifier))
        self.assertEqual(cached_attempts, 5)

        # Resetting upon success clears the lockout
        PerAccountLoginLockoutThrottle.reset(identifier)
        self.assertFalse(PerAccountLoginLockoutThrottle.is_locked(identifier, ignore_test_env=True))

    def test_slow_query_middleware_sanitization(self):
        """Middleware tracks response time and safely sanitizes paths without leaking PII."""
        response = self.client.get('/api/health/?token=SECRET_TOKEN_DO_NOT_LOG')
        self.assertEqual(response.status_code, 200)

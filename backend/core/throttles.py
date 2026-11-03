"""
Rate limiting and abuse protection throttles for OPTIMUS ORIEN.
Provides per-IP and per-account limits on authentication, registration,
password resets, and expensive bulk endpoints.
"""
import sys
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from django.core.cache import cache

class BaseTestBypassThrottle:
    """Helper to bypass rate limiting during unit test execution."""
    def allow_request(self, request, view):
        if 'test' in sys.argv or getattr(request, '_skip_throttle', False):
            return True
        return super().allow_request(request, view)

class LoginThrottle(BaseTestBypassThrottle, AnonRateThrottle):
    scope = 'login'

class SignupThrottle(BaseTestBypassThrottle, AnonRateThrottle):
    scope = 'signup'

class PasswordResetThrottle(BaseTestBypassThrottle, AnonRateThrottle):
    scope = 'password_reset'

class HeavyEndpointThrottle(BaseTestBypassThrottle, UserRateThrottle):
    scope = 'heavy'

class PerAccountLoginLockoutThrottle:
    """
    Guards against distributed credential stuffing / brute force attacks.
    Limits failed login attempts per account identifier (username/email) to 5 per 15 minutes.
    """
    MAX_ATTEMPTS = 5
    LOCKOUT_SECONDS = 900  # 15 minutes

    @classmethod
    def get_cache_key(cls, identifier: str) -> str:
        clean = (identifier or '').strip().lower()
        return f"optimus:lockout:{clean}"

    @classmethod
    def is_locked(cls, identifier: str, ignore_test_env: bool = False) -> bool:
        if ('test' in sys.argv and not ignore_test_env) or not identifier:
            return False
        attempts = cache.get(cls.get_cache_key(identifier), 0)
        return attempts >= cls.MAX_ATTEMPTS

    @classmethod
    def record_failure(cls, identifier: str):
        if not identifier:
            return
        key = cls.get_cache_key(identifier)
        attempts = cache.get(key, 0) + 1
        cache.set(key, attempts, timeout=cls.LOCKOUT_SECONDS)

    @classmethod
    def reset(cls, identifier: str):
        if identifier:
            cache.delete(cls.get_cache_key(identifier))

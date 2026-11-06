"""
DRF Permission classes and view decorators for subscription feature locking.
Returns standard HTTP 403 with machine-readable error codes when access is denied.
"""
import functools
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from core.services.entitlements import check_feature_access


class RequiresFeature(BasePermission):
    """
    DRF BasePermission class for Class-Based Views / ViewSets.
    Enforces feature gating based on school subscription tier and platform overrides.
    """
    def __init__(self, feature_key: str):
        self.feature_key = feature_key

    def __call__(self):
        return self

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Platform owners, superusers, and unscoped users bypass tenant feature gating
        if request.user.is_superuser or request.user.role == 'platform_admin' or not getattr(request.user, 'school', None):
            return True

        allowed, reason, required_plan = check_feature_access(request.user.school, self.feature_key)
        if not allowed:
            raise PermissionDenied({
                'detail': reason,
                'code': 'feature_locked',
                'feature_key': self.feature_key,
                'required_plan': required_plan or 'premium'
            })
        return True


def requires_feature(feature_key: str):
    """
    Function decorator for DRF @api_view endpoints.
    Returns HTTP 403 Forbidden with machine-readable details if feature is locked.
    """
    def decorator(view_func):
        @functools.wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user or not request.user.is_authenticated:
                return Response({'detail': 'Authentication required.'}, status=401)

            if request.user.is_superuser or request.user.role == 'platform_admin' or not getattr(request.user, 'school', None):
                return view_func(request, *args, **kwargs)

            allowed, reason, required_plan = check_feature_access(request.user.school, feature_key)
            if not allowed:
                return Response({
                    'detail': reason,
                    'code': 'feature_locked',
                    'feature_key': feature_key,
                    'required_plan': required_plan or 'premium',
                }, status=403)

            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator

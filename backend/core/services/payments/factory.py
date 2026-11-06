"""
Payment Provider Factory.
Instantiates the configured payment provider (FakeProvider, PaddleProvider, etc.).
"""
try:
    from django.conf import settings
except ImportError:
    settings = None
from typing import Optional

from .base import PaymentProvider
from .fake import FakeProvider
from .paddle import PaddleProvider


def get_payment_provider(provider_name: Optional[str] = None) -> PaymentProvider:
    """
    Returns the appropriate PaymentProvider instance based on name or settings.PAYMENT_PROVIDER.
    Defaults to 'paddle' for real MoR sandbox and live checkout.
    """
    name = (provider_name or getattr(settings, 'PAYMENT_PROVIDER', 'paddle') or 'paddle').strip().lower()

    if name in ('paddle', 'paddle_v2', 'paddle_sandbox'):
        return PaddleProvider()

    if name == 'fake':
        return FakeProvider()

    # Default to PaddleProvider
    return PaddleProvider()

"""
Payment Provider Factory.
Instantiates the configured payment provider (FakeProvider, PaddleProvider, etc.).
"""
from django.conf import settings
from typing import Optional

from .base import PaymentProvider
from .fake import FakeProvider
from .paddle import PaddleProvider


def get_payment_provider(provider_name: Optional[str] = None) -> PaymentProvider:
    """
    Returns the appropriate PaymentProvider instance based on name or settings.PAYMENT_PROVIDER.
    Defaults to 'fake' for safe testing, CI, and local dev.
    """
    name = (provider_name or getattr(settings, 'PAYMENT_PROVIDER', 'fake') or 'fake').strip().lower()

    if name in ('paddle', 'paddle_v2'):
        return PaddleProvider()

    # Default to FakeProvider
    return FakeProvider()

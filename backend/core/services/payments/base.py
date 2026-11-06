"""
Payment Provider Interface and Data Transfer Objects for OPTIMUS ORIEN.
Enables pluggable payment gateways (Paddle Billing MoR, FakeProvider for tests, Safepay, etc.)
without changing business logic or order management code.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Dict, Any


@dataclass
class CheckoutResult:
    checkout_url: str
    provider_reference: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class WebhookEvent:
    event_type: str            # 'order.paid', 'transaction.completed', 'order.failed', 'order.refunded'
    event_id: str              # Unique event ID for idempotency & replay protection
    order_reference: str       # System order_number (e.g. ORD-202611-ABC123)
    amount: Decimal            # Exact charged amount
    currency: str              # Currency code (e.g. 'USD', 'PKR')
    raw_data: Dict[str, Any]   # Full parsed payload for auditing
    provider: str = 'unknown'


@dataclass
class RefundResult:
    success: bool
    provider_refund_id: str
    message: str = ''
    raw_data: Optional[Dict[str, Any]] = None


class PaymentProviderError(Exception):
    """Base exception for payment provider operations."""
    pass


class WebhookSignatureVerificationError(PaymentProviderError):
    """Raised when incoming webhook signature is invalid or tampered."""
    pass


class PaymentProvider(ABC):
    """
    Abstract interface for hosted payment providers.
    Non-negotiable rule: Card numbers, CVV and expiry NEVER touch our application.
    All payments are hosted on the provider's domain.
    """

    @abstractmethod
    def create_checkout(self, order, return_url: str, cancel_url: str) -> CheckoutResult:
        """
        Creates a hosted checkout session for a given SubscriptionOrder.
        Returns the checkout URL to redirect the user to, and the provider reference.
        """
        pass

    @abstractmethod
    def verify_webhook(self, payload_bytes: bytes, headers: Dict[str, str]) -> bool:
        """
        Cryptographically verifies the authenticity and integrity of the webhook payload.
        Returns True if valid, False otherwise.
        """
        pass

    @abstractmethod
    def parse_event(self, payload_bytes: bytes, headers: Dict[str, str]) -> WebhookEvent:
        """
        Parses the raw webhook payload into a normalized WebhookEvent DTO.
        Raises WebhookSignatureVerificationError or ValueError if malformed.
        """
        pass

    @abstractmethod
    def refund(self, order, reason: str = '') -> RefundResult:
        """
        Requests a refund/adjustment for an existing paid order.
        """
        pass

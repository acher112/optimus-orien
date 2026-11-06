"""
Fake Payment Provider for local development, automated testing, and CI.
Simulates hosted checkout sessions, signature-verified webhooks, idempotency,
and refund workflows without making any external network requests.
"""
import hmac
import hashlib
import json
import time
from decimal import Decimal
from typing import Dict, Any, Optional
try:
    from django.conf import settings
except ImportError:
    settings = None

from .base import (
    PaymentProvider, CheckoutResult, WebhookEvent, RefundResult,
    WebhookSignatureVerificationError
)


class FakeProvider(PaymentProvider):
    """
    Test and local simulation provider implementing the full PaymentProvider interface.
    """
    DEFAULT_SECRET = "test_fake_webhook_secret_key_optimus_orien"

    def __init__(self, secret: Optional[str] = None, base_url: Optional[str] = None):
        self.secret = secret or getattr(settings, 'PADDLE_WEBHOOK_SECRET', '') or self.DEFAULT_SECRET
        self.base_url = base_url or getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173')

    def create_checkout(self, order, return_url: str, cancel_url: str) -> CheckoutResult:
        """
        Returns a mock hosted checkout URL where a simulated card transaction can be completed.
        """
        provider_ref = f"fake_sess_{order.order_number}"
        checkout_url = (
            f"{self.base_url}/billing/checkout-mock"
            f"?order={order.order_number}"
            f"&amount={order.amount}"
            f"&currency={order.currency}"
            f"&session_id={provider_ref}"
            f"&return_url={return_url}"
            f"&cancel_url={cancel_url}"
        )
        return CheckoutResult(
            checkout_url=checkout_url,
            provider_reference=provider_ref,
            metadata={'mode': 'test_sandbox'}
        )

    def verify_webhook(self, payload_bytes: bytes, headers: Dict[str, str]) -> bool:
        """
        Verifies HMAC-SHA256 signature from 'X-Provider-Signature' or 'Paddle-Signature'.
        Header format:
          X-Provider-Signature: sha256=<hex_digest>  (or bare hex digest)
          Paddle-Signature: ts=<timestamp>;h1=<hex_digest>
        """
        sig_header = (
            headers.get('X-Provider-Signature') or
            headers.get('x-provider-signature') or
            headers.get('HTTP_X_PROVIDER_SIGNATURE') or
            headers.get('Paddle-Signature') or
            headers.get('paddle-signature') or
            headers.get('HTTP_PADDLE_SIGNATURE') or
            ''
        ).strip()

        if not sig_header:
            return False

        secret_bytes = self.secret.encode('utf-8')

        # Format 1: Paddle style: ts=123456789;h1=abcdef...
        if 'ts=' in sig_header and 'h1=' in sig_header:
            parts = dict(part.split('=', 1) for part in sig_header.split(';') if '=' in part)
            ts = parts.get('ts', '')
            received_hash = parts.get('h1', '')
            signed_payload = f"{ts}:{payload_bytes.decode('utf-8')}".encode('utf-8')
            expected_hash = hmac.new(secret_bytes, signed_payload, hashlib.sha256).hexdigest()
            return hmac.compare_digest(received_hash, expected_hash)

        # Format 2: Standard HMAC: sha256=<hex> or <hex>
        received_hash = sig_header
        if received_hash.startswith('sha256='):
            received_hash = received_hash[7:]

        expected_hash = hmac.new(secret_bytes, payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(received_hash, expected_hash)

    def parse_event(self, payload_bytes: bytes, headers: Dict[str, str]) -> WebhookEvent:
        """
        Parses JSON payload and returns normalized WebhookEvent DTO.
        """
        if not self.verify_webhook(payload_bytes, headers):
            raise WebhookSignatureVerificationError("Invalid or tampered webhook signature.")

        try:
            raw = json.loads(payload_bytes.decode('utf-8'))
        except (ValueError, UnicodeDecodeError) as exc:
            raise ValueError(f"Malformed JSON payload: {exc}")

        # Normalization: handle direct structure or nested data
        event_type = raw.get('event_type') or raw.get('type') or 'order.paid'
        event_id = raw.get('event_id') or raw.get('id') or f"evt_mock_{int(time.time()*1000)}"

        data = raw.get('data', raw)
        order_ref = (
            data.get('order_number') or
            data.get('order_reference') or
            data.get('custom_data', {}).get('order_number') or
            ''
        )

        amount_val = data.get('amount')
        if amount_val is None and 'totals' in data:
            amount_val = data['totals'].get('total')
        amount = Decimal(str(amount_val or '0.00'))

        currency = (data.get('currency') or 'USD').upper()

        return WebhookEvent(
            event_type=event_type,
            event_id=event_id,
            order_reference=order_ref,
            amount=amount,
            currency=currency,
            raw_data=raw,
            provider='fake'
        )

    def refund(self, order, reason: str = '') -> RefundResult:
        """
        Simulates an immediate successful refund.
        """
        refund_id = f"fake_rf_{order.order_number}"
        return RefundResult(
            success=True,
            provider_refund_id=refund_id,
            message=f"Simulated refund for order {order.order_number} ({reason})",
            raw_data={'order_number': order.order_number, 'refund_id': refund_id}
        )

    # --------------------------------------------------------------------------
    # Helper utilities for tests
    # --------------------------------------------------------------------------

    def generate_signature(self, payload_bytes: bytes, secret: Optional[str] = None) -> str:
        """Helper to create a valid X-Provider-Signature for test requests."""
        s = secret or self.secret
        digest = hmac.new(s.encode('utf-8'), payload_bytes, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def generate_paddle_signature(self, payload_bytes: bytes, secret: Optional[str] = None, ts: Optional[int] = None) -> str:
        """Helper to create a valid Paddle-Signature (ts=...;h1=...) for test requests."""
        s = secret or self.secret
        timestamp = ts or int(time.time())
        signed_payload = f"{timestamp}:{payload_bytes.decode('utf-8')}".encode('utf-8')
        digest = hmac.new(s.encode('utf-8'), signed_payload, hashlib.sha256).hexdigest()
        return f"ts={timestamp};h1={digest}"

    def build_test_webhook_payload(self, order, event_type: str = 'order.paid',
                                   event_id: Optional[str] = None,
                                   amount: Optional[Decimal] = None,
                                   currency: Optional[str] = None) -> bytes:
        """Builds valid JSON payload for tests."""
        payload = {
            'event_id': event_id or f"evt_test_{order.order_number}",
            'event_type': event_type,
            'data': {
                'order_number': order.order_number,
                'amount': str(amount if amount is not None else order.amount),
                'currency': currency or order.currency,
                'student_count': order.student_count,
                'plan_code': order.plan.code,
            }
        }
        return json.dumps(payload).encode('utf-8')

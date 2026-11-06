"""
Paddle Billing (v2) Payment Provider Adapter.
Implements the Merchant of Record (MoR) hosted checkout, cryptographic webhook
signature verification (HMAC-SHA256), and automated subscription fulfillment.

Zero external dependencies: uses Python standard library urllib, hmac, hashlib.
Card numbers, CVV and expiry NEVER touch this server.
"""
import hmac
import hashlib
import json
import logging
import time
from decimal import Decimal
from typing import Dict, Any, Optional
from urllib import request as url_request
from urllib.error import HTTPError, URLError

try:
    from django.conf import settings
except ImportError:
    settings = None

from .base import (
    PaymentProvider, CheckoutResult, WebhookEvent, RefundResult,
    PaymentProviderError, WebhookSignatureVerificationError
)

logger = logging.getLogger('core.payments.paddle')


class PaddleProvider(PaymentProvider):
    """
    Paddle Billing (v2) adapter for OPTIMUS ORIEN.
    Connects to sandbox-api.paddle.com or api.paddle.com.
    """
    SANDBOX_API_URL = "https://sandbox-api.paddle.com"
    LIVE_API_URL = "https://api.paddle.com"
    DEFAULT_WEBHOOK_SECRET = "pdl_sdb_whsec_optimus_orien_sandbox"

    def __init__(self, api_key: Optional[str] = None, webhook_secret: Optional[str] = None,
                 sandbox: Optional[bool] = None):
        self.api_key = api_key or getattr(settings, 'PADDLE_API_KEY', '')
        self.webhook_secret = webhook_secret or getattr(settings, 'PADDLE_WEBHOOK_SECRET', '') or self.DEFAULT_WEBHOOK_SECRET
        self.sandbox = sandbox if sandbox is not None else getattr(settings, 'PADDLE_SANDBOX', True)
        self.base_url = self.SANDBOX_API_URL if self.sandbox else self.LIVE_API_URL

    def create_checkout(self, order, return_url: str, cancel_url: str) -> CheckoutResult:
        """
        Creates a transaction / checkout session on Paddle Billing.
        If live/sandbox API key is provided, invokes Paddle v2 Transactions API.
        If running without API key in sandbox simulation, produces a hosted checkout URL.
        """
        if not self.api_key:
            # Fallback simulated hosted checkout link for sandbox testbeds
            provider_ref = f"txn_mock_{order.order_number}"
            checkout_url = (
                f"https://sandbox-checkout.paddle.com/checkout"
                f"?order={order.order_number}"
                f"&plan={order.plan.code}"
                f"&amount={order.amount}"
                f"&currency={order.currency}"
                f"&return_url={return_url}"
            )
            return CheckoutResult(
                checkout_url=checkout_url,
                provider_reference=provider_ref,
                metadata={'simulated': True, 'sandbox': self.sandbox}
            )

        payload = {
            "items": [
                {
                    "quantity": order.student_count,
                    "price": {
                        "description": f"{order.plan.name} ({order.billing_months} Months - {order.student_count} Active Students)",
                        "unit_price": {
                            "amount": str(int(order.unit_price * 100)),
                            "currency_code": order.currency
                        },
                        "product_id": f"pro_{order.plan.code}"
                    }
                }
            ],
            "custom_data": {
                "order_number": order.order_number,
                "school_id": order.school_id,
                "billing_months": order.billing_months,
                "plan_code": order.plan.code,
            },
            "checkout": {
                "url": return_url
            }
        }

        req = url_request.Request(
            f"{self.base_url}/transactions",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "OptimusOrien-SaaS/1.0"
            },
            method="POST"
        )

        try:
            with url_request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                txn_data = data.get('data', {})
                txn_id = txn_data.get('id', f"txn_{order.order_number}")
                checkout_url = txn_data.get('checkout', {}).get('url') or txn_data.get('url')
                if not checkout_url:
                    checkout_url = f"https://sandbox-checkout.paddle.com/checkout?txn={txn_id}"

                return CheckoutResult(
                    checkout_url=checkout_url,
                    provider_reference=txn_id,
                    metadata=txn_data
                )
        except (HTTPError, URLError) as err:
            logger.error("Paddle API checkout creation failed: %s", str(err))
            raise PaymentProviderError(f"Failed to communicate with payment provider: {err}")

    def verify_webhook(self, payload_bytes: bytes, headers: Dict[str, str]) -> bool:
        """
        Paddle Billing webhook signature verification using 'Paddle-Signature' header.
        Format: ts=1671542109;h1=a9829f0412b5fb...
        Signature is HMAC-SHA256 of f"{ts}:{payload}".
        """
        sig_header = (
            headers.get('Paddle-Signature') or
            headers.get('paddle-signature') or
            headers.get('HTTP_PADDLE_SIGNATURE') or
            headers.get('X-Provider-Signature') or
            headers.get('HTTP_X_PROVIDER_SIGNATURE') or
            ''
        ).strip()

        if not sig_header or not self.webhook_secret:
            return False

        secret_bytes = self.webhook_secret.encode('utf-8')

        if 'ts=' in sig_header and 'h1=' in sig_header:
            parts = dict(part.split('=', 1) for part in sig_header.split(';') if '=' in part)
            ts_str = parts.get('ts', '')
            received_hash = parts.get('h1', '')

            # Replay protection check (reject webhooks older than 10 minutes)
            try:
                ts_int = int(ts_str)
                if abs(time.time() - ts_int) > 600:
                    logger.warning("Paddle webhook rejected due to timestamp drift: %s", ts_str)
                    return False
            except ValueError:
                return False

            signed_payload = f"{ts_str}:{payload_bytes.decode('utf-8')}".encode('utf-8')
            expected_hash = hmac.new(secret_bytes, signed_payload, hashlib.sha256).hexdigest()
            return hmac.compare_digest(received_hash, expected_hash)

        # Standard fallback HMAC-SHA256
        received_hash = sig_header
        if received_hash.startswith('sha256='):
            received_hash = received_hash[7:]

        expected_hash = hmac.new(secret_bytes, payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(received_hash, expected_hash)

    def parse_event(self, payload_bytes: bytes, headers: Dict[str, str]) -> WebhookEvent:
        """
        Parses Paddle Billing event and maps to normalized WebhookEvent.
        Supported events:
          - transaction.completed, transaction.paid -> 'order.paid'
          - transaction.canceled, transaction.past_due -> 'order.failed'
          - adjustment.created, adjustment.updated (refunds) -> 'order.refunded'
        """
        if not self.verify_webhook(payload_bytes, headers):
            raise WebhookSignatureVerificationError("Invalid or forged Paddle webhook signature.")

        try:
            raw = json.loads(payload_bytes.decode('utf-8'))
        except (ValueError, UnicodeDecodeError) as exc:
            raise ValueError(f"Invalid JSON payload: {exc}")

        event_id = raw.get('event_id') or raw.get('id') or f"evt_pdl_{int(time.time()*1000)}"
        event_type_raw = raw.get('event_type') or raw.get('type') or ''
        data = raw.get('data', {})

        # Extract order reference from custom_data
        custom_data = data.get('custom_data') or {}
        order_ref = (
            custom_data.get('order_number') or
            data.get('order_number') or
            data.get('id') or
            ''
        )

        # Amount and Currency extraction
        amount_cents = None
        details = data.get('details', {})
        totals = details.get('totals') or data.get('totals') or {}

        if 'amount' in data:
            amount_cents = data.get('amount')
        elif 'total' in totals:
            amount_cents = totals.get('total')
        elif 'payments' in data and data['payments']:
            amount_cents = data['payments'][0].get('amount')

        currency = (data.get('currency_code') or totals.get('currency_code') or 'USD').upper()

        if amount_cents is not None:
            # Paddle amounts in totals are in string cents / lowest denomination, or standard Decimal string
            try:
                # If amount_cents has no dot and is integer-like (e.g. 77760 for $777.60), convert
                val_str = str(amount_cents)
                if '.' in val_str:
                    amount = Decimal(val_str)
                else:
                    amount = (Decimal(val_str) / Decimal(100)).quantize(Decimal('0.01'))
            except Exception:
                amount = Decimal('0.00')
        else:
            amount = Decimal('0.00')

        # Map event type
        if event_type_raw in ('transaction.completed', 'transaction.paid', 'order.paid'):
            event_type = 'order.paid'
        elif event_type_raw in ('transaction.canceled', 'transaction.past_due', 'order.failed'):
            event_type = 'order.failed'
        elif event_type_raw in ('adjustment.created', 'adjustment.updated', 'order.refunded'):
            event_type = 'order.refunded'
        else:
            event_type = event_type_raw

        return WebhookEvent(
            event_type=event_type,
            event_id=event_id,
            order_reference=order_ref,
            amount=amount,
            currency=currency,
            raw_data=raw,
            provider='paddle'
        )

    def refund(self, order, reason: str = '') -> RefundResult:
        """
        Creates an adjustment on Paddle Billing for refunding an order.
        """
        if not self.api_key:
            return RefundResult(
                success=True,
                provider_refund_id=f"sim_adj_{order.order_number}",
                message=f"Simulated refund for {order.order_number}"
            )

        payload = {
            "action": "refund",
            "transaction_id": order.provider_reference or order.order_number,
            "reason": reason or "Customer requested refund",
            "type": "full"
        }

        req = url_request.Request(
            f"{self.base_url}/adjustments",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )

        try:
            with url_request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                adj_id = data.get('data', {}).get('id', 'adj_success')
                return RefundResult(success=True, provider_refund_id=adj_id, raw_data=data)
        except Exception as err:
            logger.error("Paddle refund failed: %s", str(err))
            return RefundResult(success=False, provider_refund_id='', message=str(err))

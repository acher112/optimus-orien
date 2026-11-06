# Optimus Orien — Keys & Environment Configuration

**Document Version:** 1.0  
**Milestone:** Subscription Plans, 3-Day Trial, Entitlements Engine, and Feature Locking  
**Secrets Policy:** Offline Bank Payment Model — **No New External Secrets Required**

---

## 1. Secrets Overview & Third-Party Gateways
For this milestone, payment gateways (Stripe, PayPal, JazzCash, EasyPaisa API keys) are **explicitly not integrated**.
- School subscriptions are activated via offline bank deposits verified manually by platform administrators.
- Platform bank credentials (bank name, account title, account number, IBAN) are entered and updated exclusively as database records via `PlatformBillingSettings` by authorized platform administrators.
- **No API keys, webhooks, or third-party payment secrets are introduced or required.**

---

## 2. Standard Platform Environment Variables

| Variable Name | Required? | Default / Example | Purpose / Description |
| :--- | :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | Yes | `(Random 50+ char string)` | Cryptographic signing key for Django sessions and CSRF tokens. Minimum 32 chars required when `DEBUG=false`. |
| `DJANGO_DEBUG` | Optional | `false` | Enables debug mode in local development. Must be `false` in production. |
| `DJANGO_ALLOWED_HOSTS` | Optional | `localhost,127.0.0.1` | Comma-separated list of valid Host header hostnames. |
| `CORS_ALLOWED_ORIGINS` | Optional | `http://localhost:5173,...` | Allowed Cross-Origin Resource Sharing (CORS) origins for browser API access. |
| `CSRF_TRUSTED_ORIGINS` | Optional | `https://optimus-orien.vercel.app,...` | Trusted origins for CSRF validation on mutating requests. |

---

## 3. Database Configuration (PostgreSQL / SQLite)

| Variable Name | Required? | Default / Example | Purpose / Description |
| :--- | :--- | :--- | :--- |
| `POSTGRES_DB` | Optional | `postgres` / `optimus_dev` | PostgreSQL database name. If omitted, falls back to local SQLite `db.sqlite3`. |
| `POSTGRES_USER` | Optional | `postgres` | PostgreSQL connection username. |
| `POSTGRES_PASSWORD` | Optional | `admin` | PostgreSQL connection password. |
| `POSTGRES_HOST` | Optional | `localhost` | PostgreSQL host. |
| `POSTGRES_PORT` | Optional | `5432` | PostgreSQL port. |
| `DATABASE_URL` | Optional | `postgres://user:pass@host:5432/db` | Alternative 12-factor standard database URL. |

---

## 4. Subscriptions & Billing Runtime Settings
All commercial parameters are configured dynamically in the database via `PlatformBillingSettings` and `Plan` models (editable in the Platform Admin Console), eliminating the need for environment variable deployments to alter pricing:
- `default_trial_days`: Configurable in `PlatformBillingSettings` (default: 3 days).
- `pending_grace_days`: Configurable in `PlatformBillingSettings` (default: 3 days).
- `past_due_grace_days`: Configurable in `PlatformBillingSettings` (default: 7 days).
- `yearly_discount_percentage`: Configurable in `PlatformBillingSettings` (default: 0.00%).
- `Standard Plan`: USD \$3.60 / student / month; PKR 1,000 / student / month (data model in `Plan`).
- `Premium Plan`: USD \$7.20 / student / month; PKR 2,000 / student / month (data model in `Plan`).

---

## 5. Card Payment Provider & Webhook Settings (Sandbox First)

The platform supports pluggable payment providers (`FakeProvider` for automated testing and CI; `PaddleProvider` for live/sandbox Merchant of Record card processing).
Card credentials (numbers, CVV, expiry) **never touch frontend state, backend, database or logs**.

| Variable Name | Required? | Default / Example | Purpose / Description |
| :--- | :--- | :--- | :--- |
| `PAYMENT_PROVIDER` | Optional | `fake` (default) / `paddle` | Controls which payment adapter processes hosted checkout requests. |
| `PADDLE_API_KEY` | Optional | `paddlev2_sandbox_...` | Paddle Billing v2 API key for creating transactions and adjustments. Leave empty in `fake` mode. |
| `PADDLE_WEBHOOK_SECRET` | Optional | `pdl_ntf_set_...` | Secret key used to verify incoming `Paddle-Signature` HMAC-SHA256 headers. |
| `PADDLE_SANDBOX` | Optional | `true` | When `true`, targets `https://sandbox-api.paddle.com`. Must be explicitly set to `false` for live production. |
| `PADDLE_CLIENT_TOKEN` | Optional | `test_...` | Client-side overlay token for Paddle.js in frontend checkout overlay (Stage 2/3). |
| `FRONTEND_BASE_URL` | Optional | `http://localhost:5173` | Base URL used to construct checkout completion and cancellation return redirects. |


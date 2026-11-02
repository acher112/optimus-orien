"""Cryptographic, masking, and validation utilities for Parent & Guardian Identity data.

Handles:
- Field-level authenticated encryption at rest (Fernet AES-128-CBC + HMAC-SHA256).
- Deterministic keyed HMAC-SHA256 hash for duplicate detection.
- Sensitive ID masking (e.g. 12345-*******-1).
- Pakistani CNIC format (13 digits) and international passport validation.
- Mobile phone normalization (e.g. 0300-1234567 -> +923001234567).
"""
import base64
import hashlib
import hmac
import re
from django.conf import settings
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    """Derives a deterministic 32-byte urlsafe base64 key from settings.SECRET_KEY."""
    derived_bytes = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    urlsafe_key = base64.urlsafe_b64encode(derived_bytes)
    return Fernet(urlsafe_key)


def encrypt_identity_number(raw_id: str) -> str:
    """Encrypts identity document number at rest."""
    if not raw_id:
        return ""
    clean = str(raw_id).strip()
    return _get_fernet().encrypt(clean.encode('utf-8')).decode('utf-8')


def decrypt_identity_number(encrypted_id: str) -> str:
    """Decrypts identity document number. Never log the returned value."""
    if not encrypted_id:
        return ""
    try:
        return _get_fernet().decrypt(encrypted_id.encode('utf-8')).decode('utf-8')
    except Exception:
        return ""


def normalize_identity_number(identity_type: str, raw_id: str) -> str:
    """Normalizes identity string for canonical comparison and hashing."""
    if not raw_id:
        return ""
    s = str(raw_id).strip()
    itype = str(identity_type or 'cnic').lower()
    if itype == 'cnic':
        # Remove dashes, spaces, and non-digits
        return ''.join(c for c in s if c.isdigit())
    # Passports or other: uppercase and strip whitespace
    return ''.join(s.split()).upper()


def compute_identity_hash(identity_type: str, raw_id: str) -> str:
    """Keyed HMAC-SHA256 hash across organisation for duplicate detection."""
    norm = normalize_identity_number(identity_type, raw_id)
    if not norm:
        return ""
    key = settings.SECRET_KEY.encode('utf-8')
    data = f"{identity_type.lower()}:{norm}".encode('utf-8')
    return hmac.new(key, data, hashlib.sha256).hexdigest()


def mask_identity_number(identity_type: str, raw_or_norm_id: str) -> str:
    """Masks identity number for UI and standard non-revealed display."""
    norm = normalize_identity_number(identity_type, raw_or_norm_id)
    if not norm:
        return ""
    itype = str(identity_type or 'cnic').lower()
    if itype == 'cnic':
        if len(norm) == 13:
            return f"{norm[:5]}-*******-{norm[-1]}"
        if len(norm) >= 4:
            return f"*****-*******-{norm[-1]}"
        return "****"
    # Passport / Other
    if len(norm) > 4:
        return f"{norm[:2]}{'*' * (len(norm) - 4)}{norm[-2:]}"
    return "****"


def validate_identity_number(identity_type: str, raw_id: str) -> tuple[bool, str]:
    """Validates identity type and format. Returns (is_valid, normalized_or_error_message)."""
    if not raw_id or not str(raw_id).strip():
        return False, "Identity document number is required."
    itype = str(identity_type or 'cnic').lower()
    norm = normalize_identity_number(itype, raw_id)

    if itype == 'cnic':
        if len(norm) != 13:
            return False, "CNIC must contain exactly 13 digits (format: 12345-1234567-1 or 13 digits)."
        return True, norm

    if itype == 'passport':
        if len(norm) < 6 or len(norm) > 20 or not norm.isalnum():
            return False, "Passport number must be between 6 and 20 alphanumeric characters."
        return True, norm

    # 'other'
    if len(norm) < 3 or len(norm) > 30:
        return False, "Identity document number must be between 3 and 30 characters."
    return True, norm


def validate_cnic(raw_id: str) -> str:
    """Convenience helper that validates and normalises a 13-digit Pakistani CNIC."""
    valid, norm = validate_identity_number('cnic', raw_id)
    if not valid:
        raise ValueError(norm)
    return norm



def normalize_mobile(raw_phone: str) -> str:
    """Normalizes mobile number to E.164-like standard (+923xxxxxxxxx)."""
    if not raw_phone:
        return ""
    digits = ''.join(c for c in str(raw_phone) if c.isdigit())
    if digits.startswith('92') and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith('0') and len(digits) == 11:
        return f"+92{digits[1:]}"
    if len(digits) == 10 and digits.startswith('3'):
        return f"+92{digits}"
    if digits.startswith('0092'):
        return f"+{digits[2:]}"
    if digits:
        return f"+{digits}"
    return ""


def validate_mobile(raw_phone: str) -> tuple[bool, str]:
    """Validates mobile number format. Returns (is_valid, normalized_phone_or_error)."""
    if not raw_phone or not str(raw_phone).strip():
        return False, "Mobile phone number is required."
    norm = normalize_mobile(raw_phone)
    if norm.startswith('+923') and len(norm) == 13:
        return True, norm
    digits = norm.lstrip('+')
    if 10 <= len(digits) <= 15:
        return True, norm
    return False, "Invalid mobile number. Pakistani format expected (e.g. 03xx-xxxxxxx or +923xxxxxxxxx)."

"""Regex-based PII detection and redaction.

Covers email, phone numbers, passport numbers, credit cards (with Luhn validation),
US Social Security Numbers (SSN), and API keys/tokens.
Provides safe masked previews for logging and audit traces, and in-place redaction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)[-.\s]?)?\d{3}[-.\s]?\d{3,4}[-.\s]?\d{0,4}(?!\d)"
)

PASSPORT_PATTERN = re.compile(r"\b[A-Z]{1,2}\d{6,9}\b")

CREDIT_CARD_CANDIDATE_PATTERN = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")

SSN_PATTERN = re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)")

API_KEY_PATTERN = re.compile(
    r"\b(?:sk-[a-zA-Z0-9_-]{20,}|tb_[a-zA-Z0-9_-]{20,}|Bearer\s+eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b"
)

_MIN_PHONE_DIGITS = 7


@dataclass(frozen=True)
class PiiMatch:
    type: str
    preview: str


def _mask(value: str) -> str:
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}{'*' * (len(value) - 4)}{value[-2:]}"


def _luhn_checksum_is_valid(digits: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(digits)):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def find_pii(text: str) -> list[PiiMatch]:
    """One match per PII type found, each as a safely masked preview."""
    found: dict[str, str] = {}

    for match in EMAIL_PATTERN.finditer(text):
        found.setdefault("email", match.group())

    for match in PASSPORT_PATTERN.finditer(text):
        found.setdefault("passport_number", match.group())

    for match in CREDIT_CARD_CANDIDATE_PATTERN.finditer(text):
        digits = re.sub(r"[ -]", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn_checksum_is_valid(digits):
            found.setdefault("credit_card", match.group())

    for match in SSN_PATTERN.finditer(text):
        found.setdefault("ssn", match.group())

    for match in API_KEY_PATTERN.finditer(text):
        found.setdefault("api_key", match.group())

    for match in PHONE_PATTERN.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if len(digits) >= _MIN_PHONE_DIGITS:
            # Avoid re-matching a credit card or SSN as phone number
            matched_str = match.group()
            if not SSN_PATTERN.fullmatch(matched_str.strip()):
                found.setdefault("phone_number", matched_str)

    return [PiiMatch(type=pii_type, preview=_mask(value)) for pii_type, value in found.items()]


def redact_pii(text: str) -> str:
    """Returns the input text with all detected PII replaced with redaction tokens."""
    redacted = text

    # Redact API keys and bearer tokens first
    redacted = API_KEY_PATTERN.sub("[REDACTED_API_KEY]", redacted)

    # Redact email addresses
    redacted = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", redacted)

    # Redact credit cards (valid Luhn only)
    for match in list(CREDIT_CARD_CANDIDATE_PATTERN.finditer(redacted)):
        digits = re.sub(r"[ -]", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn_checksum_is_valid(digits):
            redacted = redacted.replace(match.group(), "[REDACTED_CREDIT_CARD]")

    # Redact SSNs
    redacted = SSN_PATTERN.sub("[REDACTED_SSN]", redacted)

    # Redact Passports
    redacted = PASSPORT_PATTERN.sub("[REDACTED_PASSPORT]", redacted)

    # Redact phone numbers
    for match in list(PHONE_PATTERN.finditer(redacted)):
        digits = re.sub(r"\D", "", match.group())
        if len(digits) >= _MIN_PHONE_DIGITS:
            redacted = redacted.replace(match.group(), "[REDACTED_PHONE]")

    return redacted

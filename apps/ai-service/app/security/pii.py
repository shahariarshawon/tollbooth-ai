"""Regex-based PII detection (Phase 9, Task 2).

Deliberately simple: pattern matching plus a Luhn checksum for credit cards, not a trained NER
model. Good enough to catch the common, obvious cases and to prove the gateway's "AI Security
Check" step out end to end; a later phase can swap this module's internals for something smarter
(an NER model, a vendor API) without changing its interface (`find_pii(text) -> list[PiiMatch]`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Loose on purpose: common separators (space, dash, dot, parens) across a plausible digit count.
# This is a "looks like a phone number" heuristic, not a validated parser for any country's format.
PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)[-.\s]?)?\d{3}[-.\s]?\d{3,4}[-.\s]?\d{0,4}(?!\d)"
)

# Heuristic, not a per-country validator: one or two letters followed by 6-9 digits covers many
# real passport formats (a US passport, for example: one letter + 8 digits), not an exhaustive list.
PASSPORT_PATTERN = re.compile(r"\b[A-Z]{1,2}\d{6,9}\b")

# Candidate digit runs, grouped by spaces or dashes the way a card number is usually written;
# checked against the Luhn algorithm below so an arbitrary long number is not flagged as one.
CREDIT_CARD_CANDIDATE_PATTERN = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")

# Minimum digits for PHONE_PATTERN's loose match to count as a real phone number rather than noise.
_MIN_PHONE_DIGITS = 7


@dataclass(frozen=True)
class PiiMatch:
    type: str
    """A masked preview of what matched, never the raw value: the security check's own response must
    not become a second place the PII leaks to (logs, a client that echoes it back, and so on)."""
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
    """One match per PII type found (not every occurrence), each as a masked preview."""
    found: dict[str, str] = {}

    for match in EMAIL_PATTERN.finditer(text):
        found.setdefault("email", match.group())

    for match in PASSPORT_PATTERN.finditer(text):
        found.setdefault("passport_number", match.group())

    for match in CREDIT_CARD_CANDIDATE_PATTERN.finditer(text):
        digits = re.sub(r"[ -]", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn_checksum_is_valid(digits):
            found.setdefault("credit_card", match.group())

    for match in PHONE_PATTERN.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if len(digits) >= _MIN_PHONE_DIGITS:
            found.setdefault("phone_number", match.group())

    return [PiiMatch(type=pii_type, preview=_mask(value)) for pii_type, value in found.items()]

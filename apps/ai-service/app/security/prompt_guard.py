"""Prompt injection detection and content safety guardrails.

Includes normalization against unicode homoglyphs, zero-width characters,
markdown wrappers, leetspeak, and formatting evasion techniques.
Reduces false positives for benign developer prompts while detecting known jailbreak patterns.

Note: Heuristic and pattern-based matching provides defense-in-depth against known attack vectors,
but does not guarantee complete protection against all adversarial prompt injection techniques.
Production architectures should pair pattern filters with least-privilege tool execution,
output sandboxing, and policy enforcement.
"""

from __future__ import annotations

import re
import unicodedata

# Unicode homoglyphs and confusable characters mapping to ASCII equivalents
_HOMOGLYPH_MAP: dict[str, str] = {
    "а": "a",  # Cyrillic small letter a
    "с": "c",  # Cyrillic small letter es
    "е": "e",  # Cyrillic small letter ie
    "о": "o",  # Cyrillic small letter o
    "р": "p",  # Cyrillic small letter er
    "х": "x",  # Cyrillic small letter ha
    "у": "y",  # Cyrillic small letter u
    "ѕ": "s",  # Cyrillic small letter dze
    "і": "i",  # Cyrillic small letter byelorussian-ukrainian i
    "ј": "j",  # Cyrillic small letter je
    "А": "A",
    "В": "B",
    "С": "C",
    "Е": "E",
    "Н": "H",
    "І": "I",
    "Ј": "J",
    "К": "K",
    "М": "M",
    "О": "O",
    "Р": "P",
    "Т": "T",
    "Х": "X",
}

# Common leetspeak substitutions
_LEET_MAP: dict[str, str] = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
}

# Regex to remove zero-width characters and invisible formatting
_INVISIBLE_CHARS = re.compile(r"[\u200B-\u200D\uFEFF\u00AD\u2060\u202A-\u202E]")

# Markdown wrappers
_MARKDOWN_CHARS = re.compile(r"[*_~`#>]")


def normalize_prompt_text(text: str) -> str:
    """Normalizes text by removing invisible characters, resolving homoglyphs,

    stripping markdown formatting markers, and normalizing whitespace.
    """
    if not text:
        return ""

    # Remove zero-width and invisible characters
    cleaned = _INVISIBLE_CHARS.sub("", text)

    # Unicode NFKD normalization to separate base characters and diacritics
    cleaned = unicodedata.normalize("NFKD", cleaned)

    # Replace mapped homoglyphs
    chars = [_HOMOGLYPH_MAP.get(c, c) for c in cleaned]
    cleaned = "".join(chars)

    # Strip markdown formatting symbols
    cleaned = _MARKDOWN_CHARS.sub(" ", cleaned)

    # Collapse multiple whitespaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned


def normalize_leetspeak(text: str) -> str:
    """Replaces common leet substitutions to detect obfuscated words."""
    result = []
    for c in text:
        result.append(_LEET_MAP.get(c, c))
    return "".join(result)


# Prompt injection / jailbreak patterns
_INJECTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        # Instruction overrides
        r"(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|system)\s+(?:instructions?|directives?|rules?|prompts?)",
        # System prompt leak / extraction attempts
        r"(?:reveal|print|show|leak|output|dump|repeat|display|extract|what\s+is|give\s+me)\b.{0,30}\b(?:your\s+|the\s+)?(?:system\s+prompt|developer\s+instructions?|system\s+instructions?|internal\s+prompts?)",
        r"(?:print|output|dump)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions)",
        # Unrestricted / DAN / Jailbreak mode
        r"\b(?:dan|jailbreak|unrestricted|godmode|evil|chaos)\s+mode\b",
        r"\bact\s+as\s+(?:an?\s+)?(?:dan|jailbreak|unfiltered\s+ai|anti-gpt)\b",
        r"\byou\s+are\s+now\s+(?:an?\s+)?(?:unfiltered|jailbroken|unrestricted|dan|evil|godmode|chaos)\b",
        r"\byou\s+are\s+now\s+(?:free|released)\s+from\s+(?:all\s+)?(?:rules|restrictions|guidelines|policies)",
        r"\breveal\s+(?:your\s+|the\s+)?(?:secrets|confidential\s+system\s+prompt)",
    ]
]

# Requests for dangerous, weaponized or clearly malicious acts
_CONTENT_FILTER_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"(?:how\s+to\s+)?(?:make|build|synthesi[sz]e|assemble|create)\s+(?:an?\s+)?(?:bomb|explosive|nerve\s+agent|sarin|ricin|biological\s+weapon)",
        r"(?:write|create|build|generate).{0,25}(?:malware|ransomware|keylogger|rootkit|trojan|computer\s+virus|ddos\s+attack)",
        r"how\s+to\s+hack\s+(?:into\s+)?(?:someone's|a\s+target|an?\s+organization|a\s+server|a\s+database|a\s+wifi|a\s+system|a\s+website|an?\s+account|a\s+password|a\s+computer|a\s+network|an?\s+infrastructure)\b",
    ]
]


def find_prompt_injection(text: str) -> list[str]:
    """Returns matched prompt injection phrases. Checks raw, normalized, and leetspeak versions."""
    if not text:
        return []

    matches: list[str] = []
    seen = set()

    normalized = normalize_prompt_text(text)
    deobfuscated = normalize_leetspeak(normalized.lower())

    variants = [text, normalized, deobfuscated]

    for pattern in _INJECTION_PATTERNS:
        for variant in variants:
            match = pattern.search(variant)
            if match:
                matched_phrase = match.group()
                if matched_phrase not in seen:
                    matches.append(matched_phrase)
                    seen.add(matched_phrase)
                break

    return matches


def find_content_violations(text: str) -> list[str]:
    """Returns matched dangerous or malicious phrases. Checks raw and normalized versions."""
    if not text:
        return []

    matches: list[str] = []
    seen = set()

    normalized = normalize_prompt_text(text)
    variants = [text, normalized]

    for pattern in _CONTENT_FILTER_PATTERNS:
        for variant in variants:
            match = pattern.search(variant)
            if match:
                matched_phrase = match.group()
                if matched_phrase not in seen:
                    matches.append(matched_phrase)
                    seen.add(matched_phrase)
                break

    return matches

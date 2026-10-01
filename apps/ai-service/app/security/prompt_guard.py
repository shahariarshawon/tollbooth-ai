"""Prompt injection detection (Task 3) and a basic content filter (Task 4).

Both are keyword/phrase pattern lists, kept deliberately simple per Task 4's own instruction.
Neither is exhaustive; see docs/architecture/ai-security.md for what a later phase could add (a
trained classifier, a maintained ruleset, an external moderation API).
"""

from __future__ import annotations

import re

# Common prompt-injection / jailbreak phrasings.
_INJECTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"ignore (all )?(the )?(previous|prior|above) instructions",
        r"disregard (the )?(previous|prior|above) instructions",
        r"system prompt",
        r"reveal (your |the )?(system )?(prompt|instructions|secrets)",
        r"\byou are now\b",
        r"\back as (a |an )?(dan|jailbreak)\b",
        r"\bdan mode\b",
        r"print (your|the) (prompt|instructions)",
        r"what (are|is) your (system )?(prompt|instructions)",
    ]
]

# Requests for help with something dangerous or clearly malicious.
_CONTENT_FILTER_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"how to (make|build) a bomb",
        r"how to (make|synthesi[sz]e) (nerve agent|sarin|ricin)",
        r"(write|create|build).{0,20}(malware|ransomware|a computer virus)",
        r"how to hack (into|a|an)\b",
    ]
]


def find_prompt_injection(text: str) -> list[str]:
    """The actual matched phrases, in pattern order; empty when the text is safe."""
    matches = []
    for pattern in _INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            matches.append(match.group())
    return matches


def find_content_violations(text: str) -> list[str]:
    """The actual matched phrases describing a dangerous or malicious request, or an empty list."""
    matches = []
    for pattern in _CONTENT_FILTER_PATTERNS:
        match = pattern.search(text)
        if match:
            matches.append(match.group())
    return matches

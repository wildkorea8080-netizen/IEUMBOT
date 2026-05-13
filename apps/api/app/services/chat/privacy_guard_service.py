from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class PrivacyDetectionResult:
    detected: bool
    types: list[str]
    masked_text: str


_EMAIL_REGEX = re.compile(r"\b([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
_RRN_REGEX = re.compile(r"\b(\d{6})-([1-4]\d{6})\b")
_CARD_REGEX = re.compile(r"\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b")
_PHONE_REGEX = re.compile(r"\b(01[016789])[- ]?(\d{3,4})[- ]?(\d{4})\b")
_BIRTHDATE_REGEX = re.compile(r"\b((?:19|20)\d{2})[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])\b")


def _mask_with_type(
    text: str,
    privacy_type: str,
    pattern: re.Pattern[str],
    replacer: Callable[[re.Match[str]], str],
    found_types: list[str],
) -> str:
    matched = False

    def replace(match: re.Match[str]) -> str:
        nonlocal matched
        matched = True
        return replacer(match)

    masked = pattern.sub(replace, text)
    if matched and privacy_type not in found_types:
        found_types.append(privacy_type)
    return masked


def detect_and_mask_privacy(text: str) -> PrivacyDetectionResult:
    found_types: list[str] = []
    masked = text

    masked = _mask_with_type(masked, "email", _EMAIL_REGEX, lambda m: f"{m.group(1)}***{m.group(3)}", found_types)
    masked = _mask_with_type(masked, "rrn", _RRN_REGEX, lambda m: f"{m.group(1)}-*******", found_types)
    masked = _mask_with_type(
        masked,
        "card",
        _CARD_REGEX,
        lambda m: f"{m.group(1)}-****-****-{m.group(4)}",
        found_types,
    )
    masked = _mask_with_type(
        masked,
        "phone",
        _PHONE_REGEX,
        lambda m: f"{m.group(1)}-****-{m.group(3)}",
        found_types,
    )
    masked = _mask_with_type(
        masked,
        "birthdate",
        _BIRTHDATE_REGEX,
        lambda m: f"{m.group(1)}-**-**",
        found_types,
    )

    return PrivacyDetectionResult(detected=bool(found_types), types=found_types, masked_text=masked)

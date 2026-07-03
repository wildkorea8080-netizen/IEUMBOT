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
# 주민등록번호(뒤 첫자리 1~4) + 외국인등록번호(5~8) 모두 커버
_RRN_REGEX = re.compile(r"\b(\d{6})-([1-8]\d{6})\b")
_CARD_REGEX = re.compile(r"\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b")
_PHONE_REGEX = re.compile(r"\b(01[016789])[- ]?(\d{3,4})[- ]?(\d{4})\b")
_BIRTHDATE_REGEX = re.compile(r"\b((?:19|20)\d{2})[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])\b")
# 운전면허번호: 지역2-연도2-일련6-체크2
_DRIVER_LICENSE_REGEX = re.compile(r"\b(\d{2})-(\d{2})-(\d{6})-(\d{2})\b")
# 여권번호: 영문 1~2자 + 숫자 7~8자
_PASSPORT_REGEX = re.compile(r"\b([A-Z]{1,2})(\d{7,8})\b")


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
        "driver_license",
        _DRIVER_LICENSE_REGEX,
        lambda m: f"{m.group(1)}-**-******-**",
        found_types,
    )
    masked = _mask_with_type(
        masked,
        "passport",
        _PASSPORT_REGEX,
        lambda m: f"{m.group(1)}*******",
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

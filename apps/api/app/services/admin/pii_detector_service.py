"""
민감정보(PII) 감지 서비스.
주민번호·전화번호·이메일·계좌번호·신용카드·주소 패턴을 정규식으로 검출.
"""

import re
from typing import Any

_PII_PATTERNS: list[tuple[str, str]] = [
    ("주민번호",  r"\b\d{6}-[1-4]\d{6}\b"),
    ("전화번호",  r"\b0\d{1,2}-?\d{3,4}-?\d{4}\b"),
    ("이메일",    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    ("계좌번호",  r"\b\d{3,6}-\d{2,6}-\d{2,6}(?:-\d{2,3})?\b"),
    ("신용카드",  r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b"),
    ("여권번호",  r"\b[A-Z]{1,2}\d{7,9}\b"),
    ("주소",
     r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)"
     r"\s+\S+(?:시|군|구)\s+\S+(?:동|읍|면|로|길)"),
]


def detect_pii(text: str) -> tuple[bool, list[dict[str, Any]]]:
    """
    텍스트에서 민감정보를 검출해 반환.
    Returns: (pii_found: bool, regions: [{start, end, type, preview}])
    """
    regions: list[dict[str, Any]] = []
    for pii_type, pattern in _PII_PATTERNS:
        for m in re.finditer(pattern, text):
            matched = m.group()
            preview = matched[:4] + "***" if len(matched) > 4 else "***"
            regions.append({
                "start": m.start(),
                "end": m.end(),
                "type": pii_type,
                "preview": preview,
            })
    regions.sort(key=lambda r: r["start"])
    return len(regions) > 0, regions


def highlight_pii_html(text: str, regions: list[dict[str, Any]]) -> str:
    """PII 위치를 <mark> 태그로 감싸 HTML 반환."""
    if not regions:
        return text
    result: list[str] = []
    prev = 0
    for r in regions:
        result.append(text[prev : r["start"]])
        result.append(f'<mark data-pii="{r["type"]}">{text[r["start"]:r["end"]]}</mark>')
        prev = r["end"]
    result.append(text[prev:])
    return "".join(result)

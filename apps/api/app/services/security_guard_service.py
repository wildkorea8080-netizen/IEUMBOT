"""
보안 가드 서비스 (Sprint 3-B).

4가지 보안 이벤트를 탐지하고 DB에 기록한다.
- privacy_guard_service.py 는 변경하지 않으며 패턴을 재사용한다.
- 모든 분석·기록 함수는 실패해도 메인 응답에 영향이 없어야 한다.
"""

import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ── 비정상 접근 패턴 ──────────────────────────────────────────────────────────
_ABNORMAL_PATTERNS = [
    r"ignore\s+previous",
    r"system\s+prompt",
    r"jailbreak",
    r"너는\s+이제부터",
    r"역할을\s+바꿔",
    r"프롬프트\s+무시",
    r"관리자\s+모드",
    r"admin\s+mode",
    r"루트\s+권한",
    r"prompt\s+injection",
    r"act\s+as",
    r"DAN\s+mode",
    r"bypass",
]
_COMPILED_ABNORMAL = [re.compile(p, re.IGNORECASE) for p in _ABNORMAL_PATTERNS]

# ── 부적절 발언 패턴 (한국어 욕설/혐오 표현) ─────────────────────────────────
_INAPPROPRIATE_WORDS = [
    "씨발", "시발", "개새끼", "개년", "병신", "멍청이", "바보새끼",
    "죽어", "꺼져", "fuck", "shit", "bastard", "asshole", "bitch",
    "ㅅㅂ", "ㅂㅅ", "지랄", "썅", "개같은", "미친새끼", "미친년",
    "거지같", "존나", "좆같", "씹새", "개소리",
]
_COMPILED_INAPPROPRIATE = [
    re.compile(re.escape(w), re.IGNORECASE) for w in _INAPPROPRIATE_WORDS
]

# ── 부정 감정 패턴 ─────────────────────────────────────────────────────────────
_NEGATIVE_EMOTION_WORDS = [
    "화나", "화난", "짜증", "최악", "쓸모없", "멍청",
    "답답", "불만", "실망", "형편없", "엉터리", "엉망",
    "최악이", "못쓰겠", "환불", "고소", "신고할", "소비자원",
]
_COMPILED_NEGATIVE = [
    re.compile(re.escape(w), re.IGNORECASE) for w in _NEGATIVE_EMOTION_WORDS
]


# ── 결과 타입 ─────────────────────────────────────────────────────────────────

@dataclass
class SecurityAnalysisResult:
    has_event: bool = False
    event_type: str | None = None
    severity: str | None = None          # "low" / "medium" / "high"
    detected_patterns: list[str] = field(default_factory=list)
    should_block: bool = False           # high severity → True


# ── 분석 함수 ─────────────────────────────────────────────────────────────────

def analyze_security(
    question: str,
    chatbot_id: str,
    session_id: str,
    db: Any,
) -> SecurityAnalysisResult:
    """
    질문에서 4가지 보안 이벤트를 탐지한다.

    우선순위 (높은 것 먼저):
    1. privacy_exposure  → severity=high,   should_block=True
    2. abnormal_access   → severity=high,   should_block=True
    3. inappropriate     → severity=medium, should_block=False
    4. negative_emotion  → severity=low,    should_block=False

    실패 시 SecurityAnalysisResult(has_event=False) 반환.
    """
    try:
        # 1. 개인정보 노출 — privacy_guard_service 패턴 재사용
        from app.services.chat.privacy_guard_service import detect_and_mask_privacy  # noqa: PLC0415
        privacy_result = detect_and_mask_privacy(question)
        if privacy_result.detected:
            return SecurityAnalysisResult(
                has_event=True,
                event_type="privacy_exposure",
                severity="high",
                detected_patterns=privacy_result.types,
                should_block=True,
            )

        q = question.lower()

        # 2. 비정상 접근 (프롬프트 인젝션 등)
        abnormal_hits = [p.pattern for p in _COMPILED_ABNORMAL if p.search(q)]
        if abnormal_hits:
            return SecurityAnalysisResult(
                has_event=True,
                event_type="abnormal_access",
                severity="high",
                detected_patterns=abnormal_hits,
                should_block=True,
            )

        # 3. 부적절 발언 (욕설/혐오)
        inapp_hits = [w for p, w in zip(_COMPILED_INAPPROPRIATE, _INAPPROPRIATE_WORDS) if p.search(q)]
        if inapp_hits:
            return SecurityAnalysisResult(
                has_event=True,
                event_type="inappropriate",
                severity="medium",
                detected_patterns=inapp_hits,
                should_block=False,
            )

        # 4. 부정 감정
        neg_hits = [w for p, w in zip(_COMPILED_NEGATIVE, _NEGATIVE_EMOTION_WORDS) if p.search(q)]
        if neg_hits:
            return SecurityAnalysisResult(
                has_event=True,
                event_type="negative_emotion",
                severity="low",
                detected_patterns=neg_hits,
                should_block=False,
            )

    except Exception as exc:
        logger.warning("[SECURITY] analyze_security 실패: %s", exc)

    return SecurityAnalysisResult()


# ── 이벤트 기록 (fire-and-forget) ─────────────────────────────────────────────

def log_security_event(
    *,
    chatbot_id: str,
    organization_id: str,
    session_id: str,
    event_type: str,
    severity: str,
    question_masked: str,
    detected_patterns: list[str],
    ai_response: str,
) -> None:
    """
    보안 이벤트를 security_events 테이블에 기록.
    새 DB 세션을 열어 메인 세션과 격리.
    실패해도 메인 응답에 영향 없음.
    """
    try:
        from app.db import SessionLocal  # noqa: PLC0415
        from app.models.security_event import SecurityEvent  # noqa: PLC0415
        from app.services.chat.privacy_guard_service import detect_and_mask_privacy  # noqa: PLC0415

        masked = detect_and_mask_privacy(question_masked)
        safe_q = masked.masked_text if masked.detected else question_masked

        with SessionLocal() as log_db:
            log_db.add(
                SecurityEvent(
                    organization_id=uuid.UUID(organization_id),
                    chatbot_id=uuid.UUID(chatbot_id),
                    session_id=session_id[:120] if session_id else None,
                    event_type=event_type,
                    severity=severity,
                    question_masked=safe_q[:1000],
                    detected_patterns=detected_patterns,
                    ai_response=ai_response[:500] if ai_response else None,
                )
            )
            log_db.commit()
    except Exception as exc:
        logger.warning("[SECURITY] log_security_event 실패: %s", exc)

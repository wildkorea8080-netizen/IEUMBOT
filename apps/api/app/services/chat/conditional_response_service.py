"""
조건별 CTA(Call-To-Action) 매칭 서비스 (Sprint 3-A).

등록된 ConditionalResponse 규칙 중 질문/답변에서 키워드가 매칭되는 것을
priority 순으로 최대 3개 반환한다.
실패 시 항상 [] 반환 — 메인 응답에 영향 없음.
"""

import logging
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.conditional_response import ConditionalResponse

logger = logging.getLogger(__name__)

_MAX_ACTIONS = 3


def match_conditional_responses(
    question: str,
    answer_text: str,
    chatbot_id: str,
    db: Session,
) -> list[dict[str, Any]]:
    """
    등록된 조건 중 매칭되는 CTA 액션을 반환.

    키워드 매칭:
    - trigger_type == "question" → question 에서 검색
    - trigger_type == "answer"   → answer_text 에서 검색
    - trigger_type == "both"     → 둘 중 하나에서 매칭되면 포함
    - 매칭: any(kw.lower() in target.lower() for kw in trigger_keywords)

    반환 형식:
    [
        {"type": "link",    "label": "신청하기", "value": "https://...", "description": "..."},
        {"type": "contact", "label": "전화 문의", "value": "tel:02-0000", "description": ""},
    ]
    """
    try:
        import uuid as _uuid  # noqa: PLC0415
        rows = db.execute(
            select(ConditionalResponse)
            .where(
                and_(
                    ConditionalResponse.chatbot_id == _uuid.UUID(chatbot_id),
                    ConditionalResponse.is_enabled.is_(True),
                )
            )
            .order_by(ConditionalResponse.priority.asc())
        ).scalars().all()
    except Exception as exc:
        logger.warning("[CONDITIONAL] DB 조회 실패: %s", exc)
        return []

    q_lower = question.lower()
    a_lower = answer_text.lower()
    results: list[dict[str, Any]] = []

    for row in rows:
        keywords: list[str] = list(row.trigger_keywords or [])
        if not keywords:
            continue

        t = row.trigger_type
        matched = False

        if t == "question":
            matched = any(kw.lower() in q_lower for kw in keywords)
        elif t == "answer":
            matched = any(kw.lower() in a_lower for kw in keywords)
        else:  # "both" — 둘 중 하나
            matched = any(kw.lower() in q_lower or kw.lower() in a_lower for kw in keywords)

        if matched:
            results.append({
                "type": row.action_type,
                "label": row.action_label,
                "value": row.action_value,
                "description": row.action_description or "",
            })
            if len(results) >= _MAX_ACTIONS:
                break

    return results

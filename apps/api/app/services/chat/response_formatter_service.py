"""
Tools API 응답 형식 변환 서비스 (Sprint 3-F).

chatbot_settings.response_format_rules 에 등록된 규칙을 기반으로
LLM 답변 텍스트를 Text / View / List 구조화 응답으로 변환한다.

structured_response=None 이면 기존 answer.text 동작이 100% 유지된다.
"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.chat_runtime import (
    ListItem,
    ListResponse,
    MoreLink,
    TextResponse,
    ViewResponse,
)

logger = logging.getLogger(__name__)


# ── 규칙 매칭 ─────────────────────────────────────────────────────────────────

def get_response_format_rule(
    question: str,
    answer_text: str,
    chatbot_id: str,
    db: Session,
) -> dict | None:
    """
    chatbot_settings.response_format_rules 에서
    질문/답변에 키워드 매칭되는 첫 번째 규칙 반환.
    없거나 실패 시 None.
    """
    try:
        import uuid as _uuid  # noqa: PLC0415
        from sqlalchemy import select  # noqa: PLC0415
        from app.models.chatbot_settings import ChatbotSetting  # noqa: PLC0415

        chatbot = db.execute(
            select(ChatbotSetting).where(ChatbotSetting.id == _uuid.UUID(chatbot_id))
        ).scalar_one_or_none()

        if chatbot is None:
            return None

        rules = list(getattr(chatbot, "response_format_rules", None) or [])
        if not rules:
            return None

        q_lower = question.lower()
        a_lower = answer_text.lower()

        for rule in rules:
            keywords = list(rule.get("keywords") or [])
            if not keywords:
                continue
            if any(kw.lower() in q_lower or kw.lower() in a_lower for kw in keywords):
                return rule

    except Exception as exc:
        logger.warning("[RESPONSE_FORMAT] 규칙 조회 실패: %s", exc)

    return None


# ── 형식 변환 함수 ────────────────────────────────────────────────────────────

def _build_more_link(raw: dict | None) -> MoreLink | None:
    if not raw or not raw.get("url"):
        return None
    return MoreLink(title=raw.get("title", "더보기"), url=raw["url"])


def format_as_text(
    answer_text: str,
    more_link: dict | None = None,
) -> TextResponse:
    return TextResponse(
        content=answer_text,
        more_link=_build_more_link(more_link),
    )


def format_as_view(
    answer_text: str,
    more_link: dict | None = None,
) -> ViewResponse:
    """
    answer_text 첫 줄 → title
    나머지 비어 있지 않은 줄 → content 리스트
    """
    lines = [ln.strip() for ln in answer_text.strip().splitlines()]
    non_empty = [ln for ln in lines if ln]
    title = non_empty[0] if non_empty else "답변"
    content = non_empty[1:] if len(non_empty) > 1 else [answer_text.strip()]
    return ViewResponse(
        title=title,
        content=content,
        more_link=_build_more_link(more_link),
    )


def format_as_list(
    answer_text: str,
    candidates: list[dict[str, Any]],
    more_link: dict | None = None,
) -> ListResponse:
    """
    RAG candidates 를 ListItem 목록으로 변환.
    candidates 없으면 answer_text 줄 단위로 분해.
    """
    items: list[ListItem] = []

    if candidates:
        for cand in candidates[:8]:
            signals = cand.get("contentSignals") or {}
            preview = str(signals.get("textPreview") or "")[:200]
            section = cand.get("sectionTitle") or cand.get("documentName") or "참고 자료"
            source_url = cand.get("sourceUrl")
            items.append(ListItem(
                title=section,
                contents=[preview] if preview else [],
                source_link_path=source_url,
                source_link_label="출처 보기" if source_url else None,
            ))
    else:
        # candidates 없으면 answer_text 를 단락 단위로 나눔
        paragraphs = [p.strip() for p in answer_text.split("\n\n") if p.strip()]
        for para in paragraphs[:6]:
            first_line = para.splitlines()[0].strip()
            rest = para.splitlines()[1:]
            items.append(ListItem(
                title=first_line,
                contents=[ln.strip() for ln in rest if ln.strip()],
            ))

    return ListResponse(
        items=items,
        more_link=_build_more_link(more_link),
    )


# ── 통합 진입점 ───────────────────────────────────────────────────────────────

def build_structured_response(
    question: str,
    answer_text: str,
    candidates: list[dict[str, Any]],
    chatbot_id: str,
    db: Session,
) -> TextResponse | ViewResponse | ListResponse | None:
    """
    규칙 매칭 → 형식 변환 → 반환.
    규칙 없으면 None (기존 answer.text 동작 유지).
    실패 시 None.
    """
    try:
        rule = get_response_format_rule(question, answer_text, chatbot_id, db)
        if rule is None:
            return None

        fmt = str(rule.get("format", "text")).lower()
        more_link_raw = rule.get("more_link")

        if fmt == "view":
            return format_as_view(answer_text, more_link=more_link_raw)
        if fmt == "list":
            return format_as_list(answer_text, candidates, more_link=more_link_raw)
        # default: text
        return format_as_text(answer_text, more_link=more_link_raw)

    except Exception as exc:
        logger.warning("[RESPONSE_FORMAT] 변환 실패: %s", exc)
        return None

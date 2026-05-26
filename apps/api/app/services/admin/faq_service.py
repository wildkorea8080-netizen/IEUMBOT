"""FAQ 서비스 — CRUD + 시맨틱 검색.

FAQ 항목은 question 임베딩을 기준으로 검색하며,
채팅 파이프라인에서 RAG보다 우선 사용된다.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.faq_item import FaqItem

logger = logging.getLogger(__name__)

FAQ_MATCH_THRESHOLD = 0.82  # 이 값 이상이면 FAQ로 답변


# ── CRUD ─────────────────────────────────────────────────────────────────────

def create_faq_item(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    question: str,
    answer: str,
    tags: list[str] | None = None,
    source_staging_session_id: str | None = None,
    category: str | None = None,
    field: str | None = None,
    memo: str | None = None,
    youtube_url: str | None = None,
    commit: bool = True,
) -> FaqItem:
    """FAQ 항목 생성 (임베딩 자동 생성).

    commit=False 로 호출하면 flush만 하고 커밋하지 않음 — 배치 등록 시 사용.
    """
    embedding = _generate_faq_embedding(question)

    row = FaqItem(
        chatbot_id=uuid.UUID(chatbot_id),
        organization_id=uuid.UUID(organization_id),
        question=question[:500],
        answer=answer,
        tags=tags or [],
        category=category,
        field=field,
        memo=memo,
        youtube_url=youtube_url,
        source_staging_session_id=source_staging_session_id,
        embedding=embedding,
        is_active=True,
        sort_order=0,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
        db.refresh(row)
    logger.info("[FAQ] created id=%s chatbot=%s", row.id, chatbot_id)
    return row


def list_faq_items(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    include_inactive: bool = False,
) -> list[FaqItem]:
    stmt = (
        select(FaqItem)
        .where(
            FaqItem.chatbot_id == uuid.UUID(chatbot_id),
            FaqItem.organization_id == uuid.UUID(organization_id),
        )
        .order_by(FaqItem.sort_order, FaqItem.created_at)
    )
    if not include_inactive:
        stmt = stmt.where(FaqItem.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def get_faq_item(db: Session, *, faq_id: str, organization_id: str) -> FaqItem | None:
    return db.execute(
        select(FaqItem).where(
            FaqItem.id == uuid.UUID(faq_id),
            FaqItem.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()


def update_faq_item(
    db: Session,
    *,
    faq_id: str,
    organization_id: str,
    question: str | None = None,
    answer: str | None = None,
    tags: list[str] | None = None,
    is_active: bool | None = None,
    sort_order: int | None = None,
    category: str | None = None,
    field: str | None = None,
    memo: str | None = None,
    youtube_url: str | None = None,
) -> FaqItem | None:
    row = get_faq_item(db, faq_id=faq_id, organization_id=organization_id)
    if row is None:
        return None

    if question is not None and question != row.question:
        row.question = question[:500]
        row.embedding = _generate_faq_embedding(question)
    if answer is not None:
        row.answer = answer
    if tags is not None:
        row.tags = tags
    if is_active is not None:
        row.is_active = is_active
    if sort_order is not None:
        row.sort_order = sort_order
    if category is not None:
        row.category = category
    if field is not None:
        row.field = field
    if memo is not None:
        row.memo = memo
    if youtube_url is not None:
        row.youtube_url = youtube_url

    db.commit()
    db.refresh(row)
    return row


def delete_faq_item(db: Session, *, faq_id: str, organization_id: str) -> bool:
    row = get_faq_item(db, faq_id=faq_id, organization_id=organization_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


# ── 시맨틱 검색 ──────────────────────────────────────────────────────────────

def search_faq_by_question(
    db: Session,
    *,
    chatbot_id: str,
    query: str,
    threshold: float = FAQ_MATCH_THRESHOLD,
) -> dict[str, Any] | None:
    """질문과 가장 유사한 FAQ를 반환. threshold 미달이면 None.

    반환 형태: {"question": str, "answer": str, "tags": list, "score": float}
    """
    try:
        from app.services.embedding_service import generate_embedding  # noqa: PLC0415

        query_embedding = generate_embedding(query)
        if query_embedding is None:
            return None

        stmt = (
            select(
                FaqItem,
                (1 - FaqItem.embedding.cosine_distance(query_embedding)).label("score"),
            )
            .where(
                FaqItem.chatbot_id == uuid.UUID(chatbot_id),
                FaqItem.is_active.is_(True),
                FaqItem.embedding.is_not(None),
            )
            .order_by((1 - FaqItem.embedding.cosine_distance(query_embedding)).desc())
            .limit(1)
        )
        row = db.execute(stmt).first()
        if row is None:
            return None

        faq_row, score = row
        score = float(score)
        if score < threshold:
            logger.debug("[FAQ] best match score=%.3f < threshold=%.2f → skip", score, threshold)
            return None

        logger.info("[FAQ] matched id=%s score=%.3f question=%s", faq_row.id, score, faq_row.question[:40])
        return {
            "id": str(faq_row.id),
            "question": faq_row.question,
            "answer": faq_row.answer,
            "tags": list(faq_row.tags or []),
            "score": score,
        }

    except Exception as exc:
        logger.warning("[FAQ] search failed: %s", exc)
        return None


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _generate_faq_embedding(text: str) -> list[float] | None:
    try:
        from app.services.embedding_service import generate_embedding  # noqa: PLC0415
        return generate_embedding(text[:500])
    except Exception as exc:
        logger.warning("[FAQ] embedding generation failed: %s", exc)
        return None

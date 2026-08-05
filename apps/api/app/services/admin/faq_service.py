"""FAQ 서비스 — CRUD + 시맨틱 검색.

FAQ 항목은 question 임베딩을 기준으로 검색하며,
채팅 파이프라인에서 RAG보다 우선 사용된다.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import Text, cast, or_, select
from sqlalchemy.orm import Session

from app.models.faq_item import FaqItem

logger = logging.getLogger(__name__)

FAQ_MATCH_THRESHOLD = 0.82  # 이 값 이상이면 FAQ로 답변


def _invalidate_chatbot_answer_cache(chatbot_id: str | None) -> None:
    """FAQ 변경 → 해당 챗봇 답변 캐시 즉시 무효화. 실패해도 메인 흐름 막지 않음."""
    if not chatbot_id:
        return
    try:
        from app.services.chat.answer_cache import invalidate_chatbot  # noqa: PLC0415

        invalidate_chatbot(str(chatbot_id))
    except Exception as exc:  # noqa: BLE001
        logger.debug("[FAQ_CACHE_INVALIDATE_FAILED] %s", exc)


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
    embedding = _generate_faq_embedding(
        db,
        compose_faq_embedding_text(question=question, category=category, field=field, tags=tags),
    )

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
    _invalidate_chatbot_answer_cache(chatbot_id)
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

    # 임베딩에 들어가는 값(질문·대분류·소분류·태그)이 하나라도 바뀌면 임베딩을 다시 만든다.
    # 분류만 고쳐도 검색 결과가 달라져야 하므로 질문 변경만 보고 판단하면 안 된다.
    embedding_dirty = False
    if question is not None and question != row.question:
        row.question = question[:500]
        embedding_dirty = True
    if answer is not None:
        row.answer = answer
    if tags is not None:
        if list(tags) != list(row.tags or []):
            embedding_dirty = True
        row.tags = tags
    if is_active is not None:
        row.is_active = is_active
    if sort_order is not None:
        row.sort_order = sort_order
    if category is not None:
        if category != row.category:
            embedding_dirty = True
        row.category = category
    if field is not None:
        if field != row.field:
            embedding_dirty = True
        row.field = field

    if embedding_dirty:
        row.embedding = _generate_faq_embedding(
            db,
            compose_faq_embedding_text(
                question=row.question, category=row.category, field=row.field, tags=row.tags
            ),
        )
    if memo is not None:
        row.memo = memo
    if youtube_url is not None:
        row.youtube_url = youtube_url

    db.commit()
    db.refresh(row)
    _invalidate_chatbot_answer_cache(str(row.chatbot_id))
    return row


def reembed_chatbot_faqs(db: Session, *, chatbot_id: str, organization_id: str) -> dict[str, int]:
    """챗봇의 모든 FAQ 임베딩을 분류·태그 포함 형태로 다시 만든다.

    기존 FAQ는 질문 문장만으로 임베딩돼 있어 대분류·소분류·태그가 검색에 반영되지 않는다.
    분류 반영 방식으로 바꾼 뒤 한 번 돌려야 이미 등록된 FAQ에도 적용된다.

    반환: {"total": 전체, "updated": 갱신 성공, "failed": 임베딩 실패}
    """
    rows = list(
        db.execute(
            select(FaqItem).where(
                FaqItem.chatbot_id == uuid.UUID(chatbot_id),
                FaqItem.organization_id == uuid.UUID(organization_id),
            )
        ).scalars()
    )

    if not rows:
        return {"total": 0, "updated": 0, "failed": 0}

    # 건당 호출하면 FAQ 수만큼 API 왕복이 생겨 요청이 길어진다 — 배치로 묶는다.
    from app.services.embedding_service import generate_embeddings_batch  # noqa: PLC0415

    texts = [
        compose_faq_embedding_text(
            question=row.question, category=row.category, field=row.field, tags=row.tags
        )
        for row in rows
    ]
    embeddings = generate_embeddings_batch(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        texts=texts,
    )

    updated = 0
    failed = 0
    for row, embedding in zip(rows, embeddings, strict=False):
        if embedding is None:
            failed += 1
            continue
        row.embedding = embedding
        updated += 1

    db.commit()
    _invalidate_chatbot_answer_cache(chatbot_id)
    logger.info(
        "[FAQ_REEMBED] chatbot_id=%s total=%d updated=%d failed=%d",
        chatbot_id, len(rows), updated, failed,
    )
    return {"total": len(rows), "updated": updated, "failed": failed}


def delete_faq_item(db: Session, *, faq_id: str, organization_id: str) -> bool:
    row = get_faq_item(db, faq_id=faq_id, organization_id=organization_id)
    if row is None:
        return False
    chatbot_id = str(row.chatbot_id)
    db.delete(row)
    db.commit()
    _invalidate_chatbot_answer_cache(chatbot_id)
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

        query_embedding = generate_embedding(db, query)
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
            # 임베딩 미달 → 태그/분류/질문 키워드 매칭 폴백.
            # (예: 사용자가 "전산업무" 같은 태그/키워드만 입력한 경우 대응)
            kw = _search_faq_by_keyword(
                db, chatbot_id=chatbot_id, query=query, query_embedding=query_embedding
            )
            if kw is not None:
                return kw
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


def _search_faq_by_keyword(
    db: Session, *, chatbot_id: str, query: str, query_embedding: list[float]
) -> dict[str, Any] | None:
    """짧은 키워드 질의가 FAQ의 태그·분류·질문에 포함되면 그 FAQ를 반환(임베딩 미달 폴백).

    여러 개면 임베딩 유사도가 가장 높은 것을 선택. 긴 문장 질의는 대상 아님(임베딩이 담당).
    """
    q = query.strip()
    if not (2 <= len(q) <= 30):
        return None
    like = f"%{q}%"
    stmt = (
        select(FaqItem, (1 - FaqItem.embedding.cosine_distance(query_embedding)).label("score"))
        .where(
            FaqItem.chatbot_id == uuid.UUID(chatbot_id),
            FaqItem.is_active.is_(True),
            FaqItem.embedding.is_not(None),
            or_(
                cast(FaqItem.tags, Text).ilike(like),
                FaqItem.question.ilike(like),
                FaqItem.category.ilike(like),
                FaqItem.field.ilike(like),
            ),
        )
        .order_by((1 - FaqItem.embedding.cosine_distance(query_embedding)).desc())
        .limit(1)
    )
    row = db.execute(stmt).first()
    if row is None:
        return None
    faq_row, score = row
    logger.info("[FAQ] keyword/tag matched id=%s query=%s", faq_row.id, q[:30])
    return {
        "id": str(faq_row.id),
        "question": faq_row.question,
        "answer": faq_row.answer,
        "tags": list(faq_row.tags or []),
        "score": float(score),
    }


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def compose_faq_embedding_text(
    *,
    question: str,
    category: str | None = None,
    field: str | None = None,
    tags: list | None = None,
) -> str:
    """FAQ 임베딩에 쓸 텍스트. 질문 앞에 대분류·소분류를, 뒤에 태그를 붙인다.

    질문 문장만 임베딩하면 분류가 검색에 전혀 반영되지 않아, 서로 다른 대분류의
    FAQ가 같은 태그(예: '이용요금')를 공유할 때 엉뚱한 쪽이 매칭된다.
    ('거주자주차'를 보다 '이용요금'을 물었는데 '정기주차' 요금이 나오는 문제)
    분류를 앞에 두어 같은 표현이라도 소속이 다르면 벡터가 갈라지게 한다.
    """
    parts = [str(value).strip() for value in (category, field, question) if value and str(value).strip()]
    tag_text = " ".join(str(tag).strip() for tag in (tags or []) if str(tag).strip())
    if tag_text:
        parts.append(tag_text)
    return " ".join(parts)


def _generate_faq_embedding(db: Session, text: str) -> list[float] | None:
    try:
        from app.services.embedding_service import generate_embedding  # noqa: PLC0415
        return generate_embedding(db, text[:500])
    except Exception as exc:
        logger.warning("[FAQ] embedding generation failed: %s", exc)
        return None

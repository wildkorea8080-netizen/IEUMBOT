"""
지식 스테이징 서비스 — 업로드 후 AI 분석 → 사용자 검토 → 개별 등록.

흐름:
  파일/텍스트 업로드
    → _split_semantic_chunks()   : 단락 기반 청킹
    → _generate_topic_title()    : LLM 주제명 생성 (실패 시 규칙 기반 폴백)
    → detect_pii()               : 민감정보 감지
    → _check_merge_candidate()   : 기존 지식 유사도 검사
    → KnowledgeStagingSession/Chunk 저장
  사용자 검토 후 register_chunks() 호출
    → createKnowledgeText() 내부 서비스로 각 청크를 지식으로 등록
"""

import json
import logging
import re
import urllib.error
import urllib.request
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_staging import KnowledgeStagingChunk, KnowledgeStagingSession
from app.services.admin.pii_detector_service import detect_pii

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 1200
_CHUNK_OVERLAP = 150
_MAX_CHUNKS_PER_SESSION = 20

# 섹션 헤딩으로 인식할 패턴 (짧은 줄 + 특정 접두사)
_HEADING_RE = re.compile(
    r"^(?:"
    r"\d{1,2}[\.\)]\s+.{2,60}"          # 1. 제목 / 1) 제목
    r"|[①-⑳⑴-⑽]\s*.{2,40}"              # ① 제목
    r"|제\s*\d+\s*[장절조항].*"           # 제1장 / 제2절
    r"|[□■▶▷◆◇●○★☆]\s*.{2,50}"         # 기호 + 제목
    r"|[A-Z][A-Z ]{3,30}$"              # ALL CAPS 영문
    r"|[가-힣]{2,15}(?:\s+[가-힣]{2,10}){0,3}$"  # 짧은 한글 (제목형)
    r")$",
    re.MULTILINE,
)


def _is_heading(line: str) -> bool:
    line = line.strip()
    if not line or len(line) > 80:
        return False
    return bool(_HEADING_RE.match(line))


def _split_semantic_chunks(text: str) -> list[str]:
    """
    섹션 헤딩을 감지해 의미 단위로 분할.
    헤딩이 없으면 단락 기반 분할로 폴백.
    """
    # 1. 헤딩 기반 분할 시도
    lines = text.splitlines()
    sections: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        if _is_heading(line) and len("\n".join(current)) > 150:
            sections.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append(current)

    # 섹션이 충분히 나뉘었으면 사용
    if len(sections) >= 3:
        raw: list[str] = ["\n".join(s).strip() for s in sections if "\n".join(s).strip()]
    else:
        # 폴백: 단락 기반
        raw = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    # 2. 너무 큰 섹션은 슬라이딩 윈도우로 재분할
    chunks: list[str] = []
    for block in raw:
        if len(block) <= _CHUNK_SIZE:
            chunks.append(block)
        else:
            for start in range(0, len(block), _CHUNK_SIZE - _CHUNK_OVERLAP):
                sub = block[start : start + _CHUNK_SIZE].strip()
                if len(sub) >= 60:
                    chunks.append(sub)

    # 3. 너무 짧은 청크는 앞 청크에 병합
    merged: list[str] = []
    for c in chunks:
        if merged and len(c) < 120 and len(merged[-1]) + len(c) < _CHUNK_SIZE:
            merged[-1] = merged[-1] + "\n\n" + c
        else:
            merged.append(c)

    return [c for c in merged if len(c.strip()) >= 60][:_MAX_CHUNKS_PER_SESSION]


# ── 주제명 생성 ───────────────────────────────────────────────────────────────

def _rule_based_title(text: str) -> str:
    """헤딩처럼 보이는 줄을 찾거나, 없으면 명사구 중심으로 첫 줄 요약."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return "주제 없음"

    # 1. 헤딩 패턴 줄 우선
    for line in lines[:6]:
        cleaned = re.sub(r"^(?:[①-⑳⑴-⑽\d]+[\.\)]\s*|[□■▶◆●★]\s*)", "", line).strip()
        if 4 <= len(cleaned) <= 30:
            return cleaned

    # 2. 첫 줄에서 불필요한 접두사 제거 후 사용
    first = re.sub(r"^(?:#+\s*|[-•*]\s*|\d+\.\s*)", "", lines[0]).strip()
    if len(first) <= 30:
        return first
    # 문장 첫 절 추출
    m = re.search(r"[,\.\s·]{1}", first[10:40])
    if m:
        return first[: m.start() + 10].strip()
    return first[:25]


def _llm_generate_title_tags(
    text: str, db: Session
) -> tuple[str, list[str]]:
    """LLM으로 주제명(15자 이내) + 태그 3개 생성. 실패 시 ('', []) 반환."""
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return "", []

        model = runtime_api.default_model or "gpt-4.1-mini"
        system_prompt = (
            '당신은 지식 분류 전문가입니다. 주어진 텍스트를 분석해 JSON으로만 응답하세요.\n'
            '규칙:\n'
            '- title: 이 텍스트 고유의 핵심 내용을 요약한 제목(20자 이내). "지원", "안내"처럼 모호한 단어만 쓰지 말 것\n'
            '- tags: 이 내용에만 해당하는 구체적 키워드 3개\n'
            '형식: {"title":"구체적 제목","tags":["키워드1","키워드2","키워드3"]}'
        )
        user_prompt = (
            f"다음 텍스트의 핵심 주제명과 태그를 생성하세요.\n"
            f"(다른 섹션과 구별되는 이 섹션만의 고유한 내용에 집중하세요)\n\n"
            f"텍스트:\n{text[:800]}"
        )

        headers: dict[str, str] = {"Content-Type": "application/json"}

        if runtime_api.provider == "anthropic":
            url = (
                f"{runtime_api.base_url.rstrip('/')}/v1/messages"
                if runtime_api.base_url
                else "https://api.anthropic.com/v1/messages"
            )
            payload: dict[str, Any] = {
                "model": model, "temperature": 0, "max_tokens": 120,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            }
            headers.update({"x-api-key": runtime_api.api_key, "anthropic-version": "2023-06-01"})
        else:
            url = (
                f"{runtime_api.base_url.rstrip('/')}/responses"
                if runtime_api.base_url
                else "https://api.openai.com/v1/responses"
            )
            payload = {
                "model": model, "temperature": 0, "max_output_tokens": 120,
                "input": [
                    {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
                    {"role": "user",   "content": [{"type": "input_text", "text": user_prompt}]},
                ],
            }
            headers["Authorization"] = f"Bearer {runtime_api.api_key}"

        req = urllib.request.Request(
            url=url,
            data=json.dumps(payload, ensure_ascii=False).encode(),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = json.loads(resp.read().decode())

        if runtime_api.provider == "anthropic":
            raw = next(
                (b["text"] for b in (result.get("content") or []) if b.get("type") == "text"), ""
            )
        else:
            raw = result.get("output_text") or ""
            if not raw:
                for item in result.get("output") or []:
                    for c in item.get("content") or []:
                        if isinstance(c, dict) and c.get("type") == "output_text":
                            raw = str(c.get("text") or "")
                            break

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return "", []
        parsed = json.loads(m.group(0))
        title = str(parsed.get("title") or "")[:50]
        tags = [str(t) for t in (parsed.get("tags") or [])][:5]
        return title, tags

    except (urllib.error.HTTPError, Exception) as exc:
        logger.debug("[STAGING] LLM title/tag gen failed: %s", exc)
        return "", []


# ── 병합 후보 검사 ────────────────────────────────────────────────────────────

def _check_merge_candidate(
    text: str,
    chatbot_id: str,
    db: Session,
) -> tuple[str | None, str | None, float | None]:
    """기존 DocumentChunk와 벡터 유사도가 높으면 (title, doc_id, score) 반환."""
    try:
        from app.services.embedding_service import generate_embedding  # noqa: PLC0415
        from sqlalchemy import text as sa_text  # noqa: PLC0415
        import uuid as _uuid  # noqa: PLC0415
        from app.models.document_chunk import DocumentChunk  # noqa: PLC0415
        from app.models.document import Document  # noqa: PLC0415
        from app.models.document_version import DocumentVersion  # noqa: PLC0415

        embedding = generate_embedding(text[:600])
        if embedding is None:
            return None, None, None

        # 코사인 유사도 상위 1개
        stmt = (
            select(
                DocumentChunk.id,
                Document.id.label("doc_id"),
                Document.title,
                (1 - DocumentChunk.embedding.cosine_distance(embedding)).label("score"),
            )
            .join(DocumentVersion, DocumentChunk.document_version_id == DocumentVersion.id)
            .join(Document, DocumentVersion.document_id == Document.id)
            .where(
                Document.chatbot_id == _uuid.UUID(chatbot_id),
                Document.status == "active",
                DocumentVersion.status == "completed",
                DocumentVersion.is_active.is_(True),
            )
            .order_by(sa_text("score DESC"))
            .limit(1)
        )
        row = db.execute(stmt).first()
        if row and float(row.score) >= 0.88:
            return str(row.title), str(row.doc_id), float(row.score)

    except Exception as exc:
        logger.debug("[STAGING] merge check skipped: %s", exc)

    return None, None, None


# ── 세션 생성 ─────────────────────────────────────────────────────────────────

def create_staging_session(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    text: str,
    source_type: str,
    source_name: str,
) -> KnowledgeStagingSession:
    """
    텍스트를 청킹·분석해 스테이징 세션을 생성하고 반환.
    LLM 주제명 생성 실패 시 규칙 기반 제목으로 폴백.
    """
    session_row = KnowledgeStagingSession(
        chatbot_id=uuid.UUID(chatbot_id),
        organization_id=uuid.UUID(organization_id),
        source_type=source_type,
        source_name=source_name,
        status="ready",
    )
    db.add(session_row)
    db.flush()

    raw_chunks = _split_semantic_chunks(text)
    session_row.total_chunks = len(raw_chunks)

    for i, chunk_text in enumerate(raw_chunks):
        # 1. 주제명 + 태그 생성
        llm_title, llm_tags = _llm_generate_title_tags(chunk_text, db)
        topic_title = llm_title or _rule_based_title(chunk_text)
        tags = llm_tags

        # 2. 민감정보 감지
        pii_found, pii_regions = detect_pii(chunk_text)

        # 3. 병합 후보 검사
        merge_title, merge_id, merge_score = _check_merge_candidate(chunk_text, chatbot_id, db)
        registration_type = "merge" if merge_title else "new"

        chunk_row = KnowledgeStagingChunk(
            session_id=session_row.id,
            topic_title=topic_title,
            content=chunk_text,
            tags=tags,
            pii_detected=pii_found,
            pii_regions=pii_regions,
            merge_candidate_title=merge_title,
            merge_candidate_id=merge_id,
            merge_score=merge_score,
            registration_type=registration_type,
            status="pending",
            sort_order=i,
        )
        db.add(chunk_row)

    db.commit()
    db.refresh(session_row)
    logger.info("[STAGING] session created id=%s chunks=%d", session_row.id, len(raw_chunks))
    return session_row


# ── 청크 등록 ─────────────────────────────────────────────────────────────────

def register_staging_chunks(
    db: Session,
    *,
    session_id: str,
    chatbot_id: str,
    chunk_ids: list[str] | None = None,
) -> dict[str, int]:
    """
    선택된 스테이징 청크를 실제 지식으로 등록.
    chunk_ids=None 이면 pending 상태 전체 등록.
    """
    from app.services.admin.knowledge_service import create_text_knowledge_internal  # noqa: PLC0415

    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id)
        )
    ).scalar_one_or_none()

    if session_row is None:
        raise ValueError("STAGING_SESSION_NOT_FOUND")

    stmt = (
        select(KnowledgeStagingChunk)
        .where(
            KnowledgeStagingChunk.session_id == session_row.id,
            KnowledgeStagingChunk.status == "pending",
        )
        .order_by(KnowledgeStagingChunk.sort_order)
    )
    if chunk_ids:
        stmt = stmt.where(
            KnowledgeStagingChunk.id.in_([uuid.UUID(cid) for cid in chunk_ids])
        )

    chunks = list(db.execute(stmt).scalars().all())
    registered = 0

    for chunk in chunks:
        try:
            create_text_knowledge_internal(
                db,
                chatbot_id=str(session_row.chatbot_id),
                organization_id=str(session_row.organization_id),
                title=chunk.topic_title,
                content=chunk.content,
                tags=list(chunk.tags or []),
            )
            chunk.status = "registered"
            registered += 1
        except Exception as exc:
            logger.warning("[STAGING] chunk register failed id=%s: %s", chunk.id, exc)
            chunk.status = "failed"

    if all(c.status != "pending" for c in db.execute(
        select(KnowledgeStagingChunk).where(
            KnowledgeStagingChunk.session_id == session_row.id
        )
    ).scalars().all()):
        session_row.status = "completed"

    db.commit()
    return {"registered": registered, "total": len(chunks)}

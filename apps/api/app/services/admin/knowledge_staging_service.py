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


def _call_llm_raw(
    runtime_api: Any,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 800,
    timeout: int = 20,
) -> str:
    """LLM 공통 호출 헬퍼. 원시 텍스트 응답 반환."""
    model = runtime_api.quality_model()  # 지식 분석: 품질 우선 (gpt-4.1 / claude-sonnet)
    headers: dict[str, str] = {"Content-Type": "application/json"}

    if runtime_api.provider == "anthropic":
        url = (
            f"{runtime_api.base_url.rstrip('/')}/v1/messages"
            if runtime_api.base_url else "https://api.anthropic.com/v1/messages"
        )
        payload: dict[str, Any] = {
            "model": model, "temperature": 0.1, "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }
        headers.update({"x-api-key": runtime_api.api_key, "anthropic-version": "2023-06-01"})
    else:
        url = (
            f"{runtime_api.base_url.rstrip('/')}/responses"
            if runtime_api.base_url else "https://api.openai.com/v1/responses"
        )
        payload = {
            "model": model, "temperature": 0.1, "max_output_tokens": max_tokens,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
                {"role": "user",   "content": [{"type": "input_text", "text": user_prompt}]},
            ],
        }
        headers["Authorization"] = f"Bearer {runtime_api.api_key}"

    req = urllib.request.Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers=headers, method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read().decode())

    if runtime_api.provider == "anthropic":
        return next((b["text"] for b in (result.get("content") or []) if b.get("type") == "text"), "")
    else:
        raw = result.get("output_text") or ""
        if not raw:
            for item in result.get("output") or []:
                for c in (item.get("content") or []):
                    if isinstance(c, dict) and c.get("type") == "output_text":
                        return str(c.get("text") or "")
        return raw


def _llm_analyze_chunk(
    text: str, db: Session
) -> tuple[str, list[str], str]:
    """
    GPT-4.1(quality_model)로 청크를 종합 분석:
    - title: 고유 주제명
    - tags: 구체적 키워드
    - content: PDF 아티팩트 제거 + 마크다운으로 정리된 내용

    실패 시 ('', [], '') 반환 → 호출자가 rule-based 폴백 처리.
    """
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return "", [], ""

        system_prompt = (
            "당신은 공공기관 챗봇 지식 데이터베이스 구축 전문가입니다.\n"
            "업로드된 문서의 섹션을 분석해 챗봇이 사용자 질문에 정확히 답할 수 있도록 정리합니다.\n"
            "반드시 순수 JSON만 출력하세요. 코드블록(```)이나 설명 텍스트는 절대 포함하지 마세요."
        )
        user_prompt = (
            "다음 문서 섹션을 분석해 JSON으로 응답하세요:\n\n"
            f"[원본 텍스트]\n{text[:1800]}\n\n"
            "응답 JSON 형식:\n"
            "{\n"
            '  "title": "이 섹션의 고유 주제명 (25자 이내, 다른 섹션과 구별되는 구체적 제목)",\n'
            '  "tags": ["핵심키워드1", "키워드2", "키워드3", "키워드4"],\n'
            '  "content": "정리된 내용 (마크다운 형식)"\n'
            "}\n\n"
            "규칙:\n"
            "- title: 이 섹션만의 핵심 내용 반영. '지원/안내/정보'같은 모호한 단어만으로 구성 금지\n"
            "- tags: 이 섹션에 직접 등장하는 명사/고유명사 위주 3-5개\n"
            "- content 규칙:\n"
            "  · PDF 변환 잔여물(페이지번호, 머리글/바닥글, 줄바꿈 오류) 제거\n"
            "  · 원본 정보를 빠짐없이 보존하면서 마크다운으로 정리\n"
            "  · 제목은 ## , 소제목은 ### , 항목은 - , 중요단어는 **굵게** 활용\n"
            "  · 표 형식은 마크다운 테이블로 변환\n"
            "  · 사용자가 질문할 때 도움이 되는 구체적 내용(날짜·금액·절차·조건 등) 반드시 보존"
        )

        raw = _call_llm_raw(runtime_api, system_prompt, user_prompt, max_tokens=1500, timeout=25)

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("[STAGING] LLM JSON not found in response: %s", raw[:100])
            return "", [], ""

        parsed = json.loads(m.group(0))
        title = str(parsed.get("title") or "")[:50]
        tags = [str(t) for t in (parsed.get("tags") or [])][:5]
        content = str(parsed.get("content") or "").strip()
        return title, tags, content

    except (urllib.error.HTTPError, Exception) as exc:
        logger.warning("[STAGING] LLM chunk analysis failed: %s", exc)
        return "", [], ""


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

def create_staging_session_immediate(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    source_type: str,
    source_name: str,
    is_duplicate_file: bool = False,
) -> KnowledgeStagingSession:
    """
    세션 레코드만 즉시 생성하고 반환 (status=analyzing).
    실제 분석은 analyze_staging_session_background()를 별도로 호출.
    """
    session_row = KnowledgeStagingSession(
        chatbot_id=uuid.UUID(chatbot_id),
        organization_id=uuid.UUID(organization_id),
        source_type=source_type,
        source_name=source_name,
        status="analyzing",
        total_chunks=0,
        is_duplicate_file=is_duplicate_file,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    logger.info("[STAGING] session created id=%s", session_row.id)
    return session_row


def analyze_staging_session_background(
    session_id: str,
    text: str,
    chatbot_id: str,
    organization_id: str,
) -> None:
    """
    백그라운드 태스크로 실행: 청킹 → LLM 주제명 → PII 감지 → 병합 검사.
    독립 DB 세션 사용 (FastAPI BackgroundTasks는 요청 세션과 분리).
    """
    from app.db import SessionLocal  # noqa: PLC0415

    db = SessionLocal()
    try:
        session_row = db.execute(
            select(KnowledgeStagingSession).where(
                KnowledgeStagingSession.id == uuid.UUID(session_id)
            )
        ).scalar_one_or_none()
        if session_row is None:
            logger.warning("[STAGING] session not found id=%s", session_id)
            return

        raw_chunks = _split_semantic_chunks(text)
        session_row.total_chunks = len(raw_chunks)
        db.flush()

        for i, chunk_text in enumerate(raw_chunks):
            # quality_model로 주제명 + 태그 + 내용 정리 한 번에 처리
            llm_title, llm_tags, llm_content = _llm_analyze_chunk(chunk_text, db)
            topic_title = llm_title or _rule_based_title(chunk_text)
            final_content = llm_content if llm_content else chunk_text

            pii_found, pii_regions = detect_pii(final_content)

            merge_title, merge_id, merge_score = _check_merge_candidate(chunk_text, chatbot_id, db)
            registration_type = "merge" if merge_title else "new"

            chunk_row = KnowledgeStagingChunk(
                session_id=session_row.id,
                topic_title=topic_title,
                content=final_content,   # LLM 정리 내용 우선, 실패 시 원본
                tags=llm_tags,
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

        session_row.status = "ready"
        db.commit()
        logger.info("[STAGING] analysis done id=%s chunks=%d", session_id, len(raw_chunks))

    except Exception as exc:
        logger.error("[STAGING] analysis failed id=%s: %s", session_id, exc)
        try:
            session_row = db.execute(
                select(KnowledgeStagingSession).where(
                    KnowledgeStagingSession.id == uuid.UUID(session_id)
                )
            ).scalar_one_or_none()
            if session_row:
                session_row.status = "failed"
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


def create_staging_session(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    text: str,
    source_type: str,
    source_name: str,
) -> KnowledgeStagingSession:
    """하위 호환 래퍼 — 동기로 전체 처리 (소량 텍스트용)."""
    session_row = create_staging_session_immediate(
        db,
        chatbot_id=chatbot_id,
        organization_id=organization_id,
        source_type=source_type,
        source_name=source_name,
    )
    analyze_staging_session_background(
        session_id=str(session_row.id),
        text=text,
        chatbot_id=chatbot_id,
        organization_id=organization_id,
    )
    db.refresh(session_row)
    return session_row


# ── 청크 등록 ─────────────────────────────────────────────────────────────────

def register_staging_chunks(
    db: Session,
    *,
    session_id: str,
    chatbot_id: str,
    chunk_ids: list[str] | None = None,
) -> dict[str, int]:
    """선택된 스테이징 청크를 FAQ + RAG 지식으로 동시 등록.

    각 청크는:
    1. FAQ 항목으로 생성 (topic_title = question, content = answer, 임베딩 자동)
    2. RAG 텍스트 지식으로도 색인 (기존 검색 파이프라인 유지)

    chunk_ids=None 이면 pending 상태 전체 등록.
    """
    from app.services.admin.knowledge_service import create_text_knowledge_internal  # noqa: PLC0415
    from app.services.admin.faq_service import create_faq_item  # noqa: PLC0415

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

    # 파일 업로드 세션은 RAG를 업로드 시점에 즉시 처리했으므로 등록 시 FAQ만 생성
    skip_rag = session_row.source_type == "file"

    for chunk in chunks:
        try:
            # ① FAQ 등록 (question=topic_title, answer=content)
            create_faq_item(
                db,
                chatbot_id=str(session_row.chatbot_id),
                organization_id=str(session_row.organization_id),
                question=chunk.topic_title,
                answer=chunk.content,
                tags=list(chunk.tags or []),
                source_staging_session_id=session_id,
            )
            # ② RAG 색인 — 텍스트 입력 세션에서만 수행 (파일은 업로드 시점에 이미 처리)
            if not skip_rag:
                try:
                    create_text_knowledge_internal(
                        db,
                        chatbot_id=str(session_row.chatbot_id),
                        organization_id=str(session_row.organization_id),
                        title=chunk.topic_title,
                        content=chunk.content,
                        tags=list(chunk.tags or []),
                    )
                except Exception as rag_exc:
                    logger.warning("[STAGING] RAG indexing failed id=%s: %s (FAQ still registered)", chunk.id, rag_exc)

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

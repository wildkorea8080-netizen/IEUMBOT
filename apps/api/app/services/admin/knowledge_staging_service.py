"""
지식 스테이징 서비스 — 업로드 후 AI 분석 → 사용자 검토 → 개별 등록.

흐름:
  파일/텍스트 업로드
    → _split_semantic_chunks()   : 단락 기반 청킹
    → _generate_topic_title()    : LLM 주제명 생성 (실패 시 규칙 기반 폴백)
    → detect_pii()               : 민감정보 감지
    → _find_faq_merge_candidate(): 기존 등록 주제(FAQ)와 유사도 검사 → 같으면 등록 시 갱신
    → KnowledgeStagingSession/Chunk 저장
  사용자 검토 후 register_chunks() 호출
    → createKnowledgeText() 내부 서비스로 각 청크를 지식으로 등록
"""

import json
import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_staging import KnowledgeStagingChunk, KnowledgeStagingSession
from app.services.admin.pii_detector_service import detect_pii
from app.services.chat.answer_generation_service import (
    _call_anthropic,
    _call_openai_like,
    _extract_output_text_anthropic,
    _extract_output_text_openai,
)

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 1200
_CHUNK_OVERLAP = 150
_MAX_CHUNKS_PER_SESSION = 20
_ANALYZE_CONCURRENCY = 4  # 청크 LLM 분석 병렬도 (DB 풀·LLM rate limit 고려한 보수적 값)

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
    model: str | None = None,
) -> str:
    """LLM 공통 호출 헬퍼. 원시 텍스트 응답 반환.

    model 미지정 시 품질 우선 모델(quality_model) 사용.
    청크 분석처럼 대량·반복 호출에는 호출자가 speed_model()을 넘겨 지연을 줄인다.
    """
    model = model or runtime_api.quality_model()

    if runtime_api.provider == "anthropic":
        response_json = _call_anthropic(
            api_key=runtime_api.api_key,
            base_url=runtime_api.base_url,
            model=model,
            temperature=0.1,
            max_output_tokens=max_tokens,
            top_p=None,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            timeout_seconds=float(timeout),
        )
        return _extract_output_text_anthropic(response_json)

    response_json = _call_openai_like(
        provider=runtime_api.provider,
        api_key=runtime_api.api_key,
        base_url=runtime_api.base_url,
        model=model,
        temperature=0.1,
        max_output_tokens=max_tokens,
        top_p=None,
        frequency_penalty=None,
        presence_penalty=None,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=float(timeout),
    )
    return _extract_output_text_openai(response_json)


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
            "반드시 순수 JSON만 출력하세요. 코드블록(```) 마크업이나 설명 문장을 JSON 앞뒤에 절대 붙이지 마세요."
        )
        user_prompt = (
            "다음 문서 섹션을 분석해 JSON으로 응답하세요:\n\n"
            f"[원본 텍스트]\n{text[:2000]}\n\n"
            "응답 JSON 형식:\n"
            "{\n"
            '  "title": "이 섹션의 고유 주제명 (25자 이내)",\n'
            '  "tags": ["키워드1", "키워드2", "키워드3"],\n'
            '  "content": "정리된 내용 (마크다운)"\n'
            "}\n\n"
            "=== title 규칙 ===\n"
            "- 이 섹션만의 핵심을 담은 구체적 제목 (예: '인턴십 지원자격 및 선발절차')\n"
            "- '지원/안내/정보' 같은 모호한 단어만으로 구성 금지\n\n"
            "=== tags 규칙 ===\n"
            "- 원문에 직접 등장하는 명사·고유명사 위주 3~5개\n\n"
            "=== content 규칙 (매우 중요) ===\n"
            "1. PDF 변환 잔여물(페이지번호, 머리글/바닥글, 의미없는 줄바꿈) 제거\n"
            "2. 원본의 모든 수치·날짜·금액·조건·절차를 빠짐없이 보존\n"
            "3. 구조화 규칙:\n"
            "   - 대제목: ## 제목\n"
            "   - 소제목: ### 소제목\n"
            "   - 나열 항목: - 항목 (들여쓰기 없이 사용)\n"
            "   - 중요 단어: **굵게**\n"
            "4. 표(테이블) 형식 규칙 (반드시 준수):\n"
            "   - 원본에 표·격자·비교 데이터가 있으면 마크다운 테이블로 변환\n"
            "   - 형식: 헤더행 | 구분행(---) | 데이터행 순서로 작성\n"
            "   - 예시:\n"
            "     | 구분 | 내용 | 비고 |\n"
            "     |------|------|------|\n"
            "     | A | 내용1 | 비고1 |\n"
            "   - 셀 내용이 없으면 빈 문자열('')이 아닌 '-' 입력\n"
            "   - 표 앞뒤에 빈 줄 추가\n"
            "5. content 전체를 JSON 문자열로 직렬화할 때 줄바꿈은 \\n으로 이스케이프"
        )

        # 청크 분석은 대량 반복 호출 → 속도 우선 모델로 지연 최소화 (gpt-4o-mini / haiku)
        raw = _call_llm_raw(
            runtime_api, system_prompt, user_prompt,
            max_tokens=2000, timeout=30, model=runtime_api.speed_model(),
        )

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("[STAGING] LLM JSON not found in response: %s", raw[:100])
            return "", [], ""

        parsed = json.loads(m.group(0))
        title = str(parsed.get("title") or "")[:50]
        tags = [str(t) for t in (parsed.get("tags") or [])][:5]
        content = str(parsed.get("content") or "").strip()
        return title, tags, content

    except Exception as exc:
        logger.warning("[STAGING] LLM chunk analysis failed: %s", exc)
        return "", [], ""


# ── AI 병합 ──────────────────────────────────────────────────────────────────

def _llm_merge_content(original: str, new_content: str, db: Session) -> str | None:
    """기존 내용과 신규 내용을 AI로 병합해 최신화된 단일 문서로 반환."""
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return None

        system_prompt = (
            "당신은 공공기관 챗봇 지식 데이터베이스 관리 전문가입니다.\n"
            "기존 지식 문서와 새로 추가된 내용을 분석해 최신화된 단일 문서로 통합합니다.\n"
            "반드시 마크다운 형식으로만 답변하세요. 설명 문장을 앞에 붙이지 마세요."
        )
        user_prompt = (
            "아래 기존 문서와 신규 내용을 하나로 통합해주세요.\n\n"
            f"[기존 내용]\n{original[:1200]}\n\n"
            f"[신규 내용]\n{new_content[:1200]}\n\n"
            "규칙:\n"
            "- 중복 내용은 최신 버전으로 통합\n"
            "- 기존에 없던 새 정보는 추가\n"
            "- 기존 정보가 변경되었으면 수정\n"
            "- 불필요한 내용은 제거\n"
            "- 마크다운 형식으로 정리 (## 제목, ### 소제목, - 항목)\n"
            "- 통합된 최종 문서만 출력"
        )
        # 병합도 대량 반복 가능 → 속도 우선 모델로 지연 최소화
        return _call_llm_raw(
            runtime_api, system_prompt, user_prompt,
            max_tokens=1800, timeout=30, model=runtime_api.speed_model(),
        ) or None
    except Exception as exc:
        logger.debug("[STAGING] merge content failed: %s", exc)
        return None


# ── 병합 후보 검사 (기존 등록 주제 = FAQ 기준) ──────────────────────────────────

_MERGE_THRESHOLD = 0.88  # 주제명 임베딩 유사도 — 이 값 이상이면 기존 FAQ를 갱신(upsert)


def _find_faq_merge_candidate(
    topic_title: str,
    chatbot_id: str,
    db: Session,
) -> tuple[str | None, str | None, float | None, str | None]:
    """새 주제가 기존 등록 주제(FAQ)와 같으면 (질문, faq_id, score, 기존답변) 반환.

    기존엔 원본 RAG 문서(raw 전체텍스트)와 비교해 들쭉날쭉했으나,
    이제 정리본끼리(주제명 ↔ FAQ 질문 임베딩) 비교 → 일관적.
    매칭 시 등록 단계(register_staging_chunks)에서 새로 만들지 않고 해당 FAQ를 갱신한다.
    """
    try:
        from app.services.admin.faq_service import search_faq_by_question  # noqa: PLC0415

        if not topic_title.strip():
            return None, None, None, None

        match = search_faq_by_question(
            db, chatbot_id=chatbot_id, query=topic_title, threshold=_MERGE_THRESHOLD
        )
        if match:
            return match["question"], match["id"], match["score"], match["answer"]
    except Exception as exc:
        logger.debug("[STAGING] FAQ merge check skipped: %s", exc)

    return None, None, None, None


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


def _analyze_one_chunk(sort_order: int, chunk_text: str, chatbot_id: str) -> dict:
    """단일 청크 분석(LLM 주제/태그/정리 + PII + FAQ 병합 검사).

    스레드 풀에서 병렬 실행되며 **스레드별 독립 DB 세션**을 쓴다(SQLAlchemy 세션은
    스레드 안전하지 않음). DB 쓰기는 하지 않고 결과 dict만 반환 → 호출자가 메인
    세션에서 순서대로 저장. 실패해도 규칙기반 폴백 dict 반환(한 청크 실패가 전체를
    막지 않음).
    """
    from app.db import SessionLocal  # noqa: PLC0415

    tdb = SessionLocal()
    try:
        llm_title, llm_tags, llm_content = _llm_analyze_chunk(chunk_text, tdb)
        topic_title = llm_title or _rule_based_title(chunk_text)
        final_content = llm_content if llm_content else chunk_text
        pii_found, pii_regions = detect_pii(final_content)

        merge_title, merge_id, merge_score, existing_answer = _find_faq_merge_candidate(
            topic_title, chatbot_id, tdb
        )
        registration_type = "merge" if merge_id else "new"
        merge_original_content: str | None = None
        if registration_type == "merge" and existing_answer:
            merge_original_content = existing_answer
            merged = _llm_merge_content(existing_answer, final_content, tdb)
            if merged:
                final_content = merged
                pii_found, pii_regions = detect_pii(final_content)

        return {
            "topic_title": topic_title,
            "content": final_content,
            "tags": llm_tags,
            "pii_detected": pii_found,
            "pii_regions": pii_regions,
            "merge_candidate_title": merge_title,
            "merge_candidate_id": merge_id,
            "merge_score": merge_score,
            "merge_original_content": merge_original_content,
            "registration_type": registration_type,
            "sort_order": sort_order,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "[STAGING] chunk analysis failed order=%d: %s (rule-based fallback)", sort_order, exc
        )
        pii_found, pii_regions = detect_pii(chunk_text)
        return {
            "topic_title": _rule_based_title(chunk_text),
            "content": chunk_text,
            "tags": [],
            "pii_detected": pii_found,
            "pii_regions": pii_regions,
            "merge_candidate_title": None,
            "merge_candidate_id": None,
            "merge_score": None,
            "merge_original_content": None,
            "registration_type": "new",
            "sort_order": sort_order,
        }
    finally:
        tdb.close()


def analyze_staging_session_background(
    session_id: str,
    text: str,
    chatbot_id: str,
    organization_id: str,
) -> None:
    """
    백그라운드 태스크로 실행: 청킹 → (병렬) LLM 주제명·PII·병합 검사 → 순차 저장.
    독립 DB 세션 사용 (FastAPI BackgroundTasks는 요청 세션과 분리).
    청크별 LLM 분석은 ThreadPoolExecutor로 병렬화(각 스레드 독립 세션), 저장은 메인 세션.
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

        # 재분석(reanalyze)에서 재사용하도록 원본 텍스트 보관
        session_row.extracted_text = text
        raw_chunks = _split_semantic_chunks(text)
        session_row.total_chunks = len(raw_chunks)
        db.flush()

        # 청크별 LLM 분석을 병렬 처리 (각 스레드 독립 세션). 결과는 sort_order로 정렬해 저장.
        results: list[dict | None] = [None] * len(raw_chunks)
        if raw_chunks:
            max_workers = min(_ANALYZE_CONCURRENCY, len(raw_chunks))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(_analyze_one_chunk, i, chunk_text, chatbot_id): i
                    for i, chunk_text in enumerate(raw_chunks)
                }
                for fut in as_completed(futures):
                    idx = futures[fut]
                    results[idx] = fut.result()

        for res in results:
            if res is None:
                continue
            db.add(
                KnowledgeStagingChunk(
                    session_id=session_row.id,
                    topic_title=res["topic_title"],
                    content=res["content"],
                    tags=res["tags"],
                    pii_detected=res["pii_detected"],
                    pii_regions=res["pii_regions"],
                    merge_candidate_title=res["merge_candidate_title"],
                    merge_candidate_id=res["merge_candidate_id"],
                    merge_score=res["merge_score"],
                    merge_original_content=res["merge_original_content"],
                    registration_type=res["registration_type"],
                    status="pending",
                    sort_order=res["sort_order"],
                )
            )

        session_row.status = "ready"
        db.commit()
        logger.info(
            "[STAGING] analysis done id=%s chunks=%d workers=%d",
            session_id, len(raw_chunks), min(_ANALYZE_CONCURRENCY, max(1, len(raw_chunks))),
        )

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
    from app.services.admin.faq_service import create_faq_item, update_faq_item  # noqa: PLC0415

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
        chunk_id_str = str(chunk.id)
        chunk_tags = list(chunk.tags or [])
        # 병합 후보(기존 FAQ와 동일 주제)면 새로 만들지 않고 기존 FAQ를 갱신(upsert)
        is_merge = chunk.registration_type == "merge" and bool(chunk.merge_candidate_id)
        # ① FAQ 등록/갱신 — 별도 세션으로 격리 (각 커밋이 메인 세션에 영향 없음)
        faq_ok = False
        try:
            from app.db import SessionLocal  # noqa: PLC0415
            with SessionLocal() as faq_db:
                updated = None
                if is_merge:
                    updated = update_faq_item(
                        faq_db,
                        faq_id=chunk.merge_candidate_id,
                        organization_id=str(session_row.organization_id),
                        answer=chunk.content,
                        tags=chunk_tags or None,
                    )
                    if updated is not None:
                        logger.info("[STAGING] FAQ updated (merge) faq=%s chunk=%s", chunk.merge_candidate_id, chunk_id_str)
                # 신규이거나, 갱신 대상 FAQ가 사라진 경우 → 새로 생성
                if updated is None:
                    create_faq_item(
                        faq_db,
                        chatbot_id=str(session_row.chatbot_id),
                        organization_id=str(session_row.organization_id),
                        question=chunk.topic_title,
                        answer=chunk.content,
                        tags=chunk_tags,
                        source_staging_session_id=session_id,
                        category=chunk_tags[0] if chunk_tags else None,
                        field=chunk_tags[1] if len(chunk_tags) > 1 else None,
                    )
            faq_ok = True
        except Exception as exc:
            logger.warning("[STAGING] FAQ register failed chunk=%s: %s", chunk_id_str, exc)

        # ② RAG 색인 — 텍스트 입력 세션 + 신규 주제에서만 수행
        #    (파일은 업로드 시점에 이미 처리, merge는 기존 지식이 이미 색인돼 있어 중복 방지)
        if faq_ok and not skip_rag and not is_merge:
            try:
                create_text_knowledge_internal(
                    db,
                    chatbot_id=str(session_row.chatbot_id),
                    organization_id=str(session_row.organization_id),
                    title=chunk.topic_title,
                    content=chunk.content,
                    tags=chunk_tags,
                )
            except Exception as rag_exc:
                logger.warning("[STAGING] RAG indexing failed chunk=%s: %s (FAQ still registered)", chunk_id_str, rag_exc)

        if faq_ok:
            chunk.status = "registered"
            registered += 1
        else:
            chunk.status = "failed"

    # autoflush=False 세션이므로 SELECT 전 명시적 flush
    db.flush()
    if all(c.status != "pending" for c in db.execute(
        select(KnowledgeStagingChunk).where(
            KnowledgeStagingChunk.session_id == session_row.id
        )
    ).scalars().all()):
        session_row.status = "completed"

    db.commit()
    return {"registered": registered, "total": len(chunks)}

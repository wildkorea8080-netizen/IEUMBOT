"""
Re-ranking 서비스 (Sprint 1-C).

USE_RERANKING=true 일 때, retrieve_for_precheck()의 전체 candidates 를
LLM 관련성 점수로 재정렬해 top_n 청크를 반환한다.

LLM 호출은 OpenAI Chat Completions API(/v1/chat/completions) 또는
Anthropic Messages API를 사용. 공유 클라이언트 빌더로 연결 풀링·재시도 확보.

실패·예외·환경변수 off 시 원본 순서 top_n 으로 fallback.
"""

import json
import logging

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.chat.answer_generation_service import (
    _build_anthropic_client,
    _build_openai_client,
)
from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

logger = logging.getLogger(__name__)

_USE_RERANKING: bool = settings.use_reranking
_RERANK_TOP_N: int = max(1, settings.rerank_top_n)
_RERANK_MAX_CANDIDATES: int = 20
_RERANK_CHUNK_TEXT_LIMIT: int = 300
_RERANK_TIMEOUT_SEC: int = 10

_RERANK_HTTP_TIMEOUT = httpx.Timeout(
    connect=5.0, read=float(_RERANK_TIMEOUT_SEC), write=10.0, pool=5.0
)


# ── 내부 LLM 호출 헬퍼 ─────────────────────────────────────────────────────


def _call_openai_rerank(
    *,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> str:
    """OpenAI / Azure OpenAI Chat Completions 호출, 텍스트 반환."""
    client = _build_openai_client(provider, api_key, base_url).with_options(
        timeout=_RERANK_HTTP_TIMEOUT,
    )
    response = client.chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=256,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    if response.choices and response.choices[0].message.content:
        return response.choices[0].message.content
    return ""


def _call_anthropic_rerank(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> str:
    """Anthropic Messages API 호출, 텍스트 반환."""
    client = _build_anthropic_client(api_key, base_url).with_options(
        timeout=_RERANK_HTTP_TIMEOUT,
    )
    response = client.messages.create(
        model=model,
        temperature=0,
        max_tokens=256,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_val = getattr(block, "text", None)
            if text_val:
                return text_val
    return ""


# ── 메인 공개 함수 ────────────────────────────────────────────────────────────


def rerank_chunks(
    db: Session,
    query: str,
    chunks: list[dict],
    top_n: int = _RERANK_TOP_N,
) -> list[dict]:
    """
    LLM을 이용한 re-ranking. 관련성 1-10 점수 기준 내림차순 정렬 후 top_n 반환.

    조기 반환 (API 호출 없이):
        1. USE_RERANKING=false
        2. len(chunks) <= top_n
        3. query 가 빈 문자열

    실패 시 fallback (원본 순서 top_n, 로그 기록):
        - resolve_runtime_api_config() 반환 None (API 키 미설정)
        - LLM API 예외 (타임아웃, 네트워크 오류 등)
        - JSON 파싱 실패 또는 빈 결과

    재정렬된 청크에는 '_reranked': True 메타데이터를 추가한다.
    """
    # ── 조기 반환 ────────────────────────────────────────────────────────────
    if not _USE_RERANKING:
        return chunks[:top_n]

    if not chunks or len(chunks) <= top_n:
        return chunks

    if not query or not query.strip():
        return chunks[:top_n]

    # ── 후보 제한 및 텍스트 추출 ─────────────────────────────────────────────
    candidates = chunks[:_RERANK_MAX_CANDIDATES]

    chunk_texts: list[str] = []
    for ch in candidates:
        signals = ch.get("contentSignals") or {}
        # promptCandidates 에서는 contentSignals.textPreview 가 텍스트 위치
        text = (
            str(signals.get("textPreview") or "")
            or str(ch.get("text_content") or "")
            or str(ch.get("text") or "")
        )
        chunk_texts.append(text[:_RERANK_CHUNK_TEXT_LIMIT])

    # ── LLM API 설정 해석 ────────────────────────────────────────────────────
    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        logger.warning("[RERANKER] No runtime API config — fallback to original order")
        return chunks[:top_n]

    model = runtime_api.speed_model()  # 리랭킹: 속도 우선

    # ── 프롬프트 조립 ────────────────────────────────────────────────────────
    system_prompt = "검색 결과 관련성 평가 전문가입니다. JSON 배열만 출력하세요."
    user_prompt = (
        f"질문: {query}\n\n"
        "각 문서 조각이 질문에 얼마나 관련있는지 1-10으로 평가하세요.\n"
        "10: 질문에 직접 답하는 내용 / 5: 부분 관련 / 1: 무관\n\n"
        + "\n".join(f"[{i}] {text}" for i, text in enumerate(chunk_texts))
        + '\n\nJSON만 응답: [{"index": 0, "score": 8}, ...]'
    )

    # ── LLM 호출 ─────────────────────────────────────────────────────────────
    try:
        if runtime_api.provider == "anthropic":
            raw_text = _call_anthropic_rerank(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
        else:
            raw_text = _call_openai_rerank(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )

        # ── JSON 파싱 및 재정렬 ───────────────────────────────────────────────
        scored: list[dict] = json.loads(raw_text)
        if not isinstance(scored, list) or not scored:
            raise ValueError(f"unexpected rerank response: {raw_text[:200]}")

        scored_sorted = sorted(scored, key=lambda x: float(x.get("score") or 0), reverse=True)

        result: list[dict] = []
        seen_indices: set[int] = set()
        for item in scored_sorted:
            idx = item.get("index")
            if not isinstance(idx, int) or idx < 0 or idx >= len(candidates):
                continue
            if idx in seen_indices:
                continue
            seen_indices.add(idx)
            chunk = dict(candidates[idx])
            chunk["_reranked"] = True
            chunk["score"] = float(item.get("score") or 0)  # LLM 관련성 점수(1-10) → 인용 rerank_score
            result.append(chunk)
            if len(result) >= top_n:
                break

        if not result:
            raise ValueError("rerank returned empty result list")

        logger.info(
            "[RERANKER] reranked %d → %d chunks for query_len=%d",
            len(candidates),
            len(result),
            len(query),
        )
        return result

    except Exception as exc:
        logger.warning(
            "[RERANKER] fallback to original order: %s: %s",
            type(exc).__name__,
            str(exc)[:200],
        )
        return chunks[:top_n]

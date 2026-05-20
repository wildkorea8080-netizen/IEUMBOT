"""
faq_generation_service.py
등록된 문서 청크를 분석해서 FAQ Q&A 쌍을 LLM으로 자동 생성.
생성된 FAQ는 관리자 검수 후 text 타입 knowledge로 등록.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from app.services.chat.answer_generation_service import (
    _call_anthropic,
    _call_openai_like,
    _extract_output_text_anthropic,
    _extract_output_text_openai,
)
from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

logger = logging.getLogger(__name__)

# ── 프롬프트 ───────────────────────────────────────────────
_FAQ_GENERATION_SYSTEM_PROMPT = """
당신은 공공기관 챗봇용 FAQ를 작성하는 전문가입니다.
주어진 문서 내용을 분석해서 시민/사용자가 자주 물어볼 만한
질문과 답변 쌍을 생성하세요.

규칙:
1. 실제 문서 내용에 근거한 질문만 생성
2. 질문은 시민 관점에서 자연스러운 구어체
3. 답변은 문서 내용을 그대로 활용, 2~4문장
4. 추측하거나 없는 내용 생성 금지
5. 반드시 JSON 배열만 반환 (다른 텍스트 없이)
""".strip()

_FAQ_GENERATION_USER_TEMPLATE = """
아래 문서 내용을 분석해서 FAQ {count}개를 생성하세요.

[문서 내용]
{content}

아래 JSON 형식으로만 응답하세요:
[
  {{"question": "질문 내용", "answer": "답변 내용"}},
  ...
]
"""


def generate_faq_from_chunks(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    knowledge_id: str,
    chunk_texts: list[str],
    faq_count: int = 5,
) -> list[dict[str, str]]:
    """
    청크 텍스트 목록에서 FAQ를 생성해 반환.
    반환: [{"question": "...", "answer": "..."}, ...]
    실패 시 빈 리스트 반환 (오류 전파 없음).
    """
    if not chunk_texts:
        return []

    faq_count = max(1, min(faq_count, 10))
    combined_content = "\n\n".join(chunk_texts)[:3000]

    user_prompt = _FAQ_GENERATION_USER_TEMPLATE.format(
        count=faq_count,
        content=combined_content,
    )

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        logger.warning(
            "[FAQ_GENERATION] skipped: no LLM API config knowledge_id=%s", knowledge_id
        )
        return []

    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=runtime_api.quality_model(),  # FAQ 생성: 품질 우선
                temperature=0.3,
                max_output_tokens=1500,
                top_p=None,
                system_prompt=_FAQ_GENERATION_SYSTEM_PROMPT,
                user_prompt=user_prompt,
            )
            raw_text = _extract_output_text_anthropic(response_json)
        else:
            response_json = _call_openai_like(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=runtime_api.quality_model(),  # FAQ 생성: 품질 우선
                temperature=0.3,
                max_output_tokens=1500,
                top_p=None,
                frequency_penalty=None,
                presence_penalty=None,
                system_prompt=_FAQ_GENERATION_SYSTEM_PROMPT,
                user_prompt=user_prompt,
            )
            raw_text = _extract_output_text_openai(response_json)

        if not raw_text:
            return []

        # JSON 파싱 (코드 블록 래퍼 제거)
        clean = raw_text.strip()
        if clean.startswith("```"):
            parts = clean.split("```")
            clean = parts[1] if len(parts) > 1 else parts[0]
            if clean.lower().startswith("json"):
                clean = clean[4:]

        faq_list = json.loads(clean.strip())
        if not isinstance(faq_list, list):
            return []

        return [
            {
                "question": str(item.get("question", "")).strip(),
                "answer":   str(item.get("answer", "")).strip(),
            }
            for item in faq_list
            if item.get("question") and item.get("answer")
        ]

    except Exception as exc:
        logger.warning(
            "[FAQ_GENERATION] failed knowledge_id=%s error=%s",
            knowledge_id,
            exc,
        )
        return []

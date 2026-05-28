"""
URL 자동 분석 서비스 — AI 기본 설정 자동 구성 (Planee 'AI 자동 설정' 기능).
URL에서 웹사이트 내용을 추출한 후 LLM으로 챗봇 기본 설정값을 제안한다.
"""

import json
import logging
import re
from html.parser import HTMLParser
from typing import Any

from sqlalchemy.orm import Session

from app.services.chat.answer_generation_service import (
    _call_anthropic,
    _call_openai_like,
    _extract_output_text_anthropic,
    _extract_output_text_openai,
)
from app.services.web_fetcher import fetch as web_fetch

logger = logging.getLogger(__name__)

_TIMEOUT = 12
_MAX_TEXT = 3000
_LLM_TIMEOUT = 10


# ── HTML → 텍스트 (JS 렌더링 사이트 대응) ────────────────────────────────────

_META_NAMES = {"description", "keywords", "og:description", "og:title", "twitter:description", "twitter:title"}

class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip = False
        self._in_title = False
        self.meta_texts: list[str] = []   # <title> + <meta> 우선 수집
        self.body_texts: list[str] = []   # 본문 텍스트

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style"):
            self._skip = True
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            attr_dict = dict(attrs)
            name = (attr_dict.get("name") or attr_dict.get("property") or "").lower()
            content = (attr_dict.get("content") or "").strip()
            if content and name in _META_NAMES:
                self.meta_texts.append(content)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = False
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            text = data.strip()
            if text:
                self.meta_texts.append(text)
        elif not self._skip:
            text = data.strip()
            if text:
                self.body_texts.append(text)


def _fetch_text(url: str) -> str:
    result = web_fetch(url, timeout_seconds=_TIMEOUT, max_bytes=150_000)
    raw = result.text
    raw_bytes = result.content  # fallback 정규식용

    parser = _TextExtractor()
    parser.feed(raw)

    # meta 텍스트를 앞에, 본문을 뒤에 붙여 JS 렌더링 사이트도 최소한의 정보 확보
    combined = parser.meta_texts + parser.body_texts
    text = " ".join(combined)
    cleaned = re.sub(r"\s+", " ", text).strip()

    # 본문이 너무 짧으면 원본 HTML에서 직접 제목·설명 재시도
    if len(cleaned) < 80:
        fallback: list[str] = []
        for m in re.finditer(r'<title[^>]*>([^<]+)</title>', raw, re.IGNORECASE):
            fallback.append(m.group(1).strip())
        for m in re.finditer(r'<meta[^>]+content=["\']([^"\']{10,})["\']', raw, re.IGNORECASE):
            fallback.append(m.group(1).strip())
        if fallback:
            cleaned = " ".join(fallback)

    return cleaned[:_MAX_TEXT]


# ── LLM 호출 ─────────────────────────────────────────────────────────────────

def _call_llm(db: Session, system: str, user: str) -> str:
    from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        return ""

    model = runtime_api.speed_model()  # URL 분석: 속도 우선
    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                temperature=0,
                max_output_tokens=400,
                top_p=None,
                system_prompt=system,
                user_prompt=user,
                timeout_seconds=_LLM_TIMEOUT,
            )
            return _extract_output_text_anthropic(response_json)
        response_json = _call_openai_like(
            provider=runtime_api.provider,
            api_key=runtime_api.api_key,
            base_url=runtime_api.base_url,
            model=model,
            temperature=0,
            max_output_tokens=400,
            top_p=None,
            frequency_penalty=None,
            presence_penalty=None,
            system_prompt=system,
            user_prompt=user,
            timeout_seconds=_LLM_TIMEOUT,
        )
        return _extract_output_text_openai(response_json)
    except Exception as exc:
        logger.warning("[URL_ANALYZER] LLM 오류: %s", exc)
        return ""


# ── 메인 분석 함수 ────────────────────────────────────────────────────────────

def analyze_url_for_chatbot_settings(db: Session, *, url: str) -> dict[str, Any]:
    """
    URL 내용 분석 → AI가 챗봇 기본 설정값 제안.
    반환: {success, error?, suggestedName, suggestedRole, suggestedDescription, suggestedFallback, suggestedWelcome}
    """

    # 1. URL 크롤링
    try:
        page_text = _fetch_text(url)
    except Exception as exc:
        logger.warning("[URL_ANALYZER] 크롤링 실패 url=%s: %s", url, exc)
        return {
            "success": False,
            "error": f"URL 접근 실패: {str(exc)[:200]}",
        }

    if not page_text.strip():
        return {
            "success": False,
            "error": "해당 URL에서 텍스트를 추출하지 못했습니다. 다른 URL을 시도해 보세요.",
        }

    # 2. LLM 설정 확인
    from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415
    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        return {
            "success": False,
            "error": "AI 분석을 위한 LLM API 설정이 필요합니다. 슈퍼관리자에게 API 설정을 요청해 주세요.",
        }

    # 3. LLM 분석
    system_prompt = (
        "당신은 한국 공공기관 챗봇 설정 전문가입니다. "
        "웹사이트 내용을 분석해서 챗봇 기본 설정값을 JSON으로만 제안합니다. 설명 없이 JSON만 출력하세요."
    )
    user_prompt = (
        f"다음 웹사이트 내용을 분석해 한국어 챗봇 설정값을 제안하세요.\n\n"
        f"웹사이트 내용:\n{page_text}\n\n"
        "아래 JSON 형식으로만 응답하세요:\n"
        "{\n"
        '  "suggestedName": "챗봇 이름 (예: 서울노동권익센터 AI 상담봇)",\n'
        '  "suggestedRole": "AI 역할 한 줄 요약",\n'
        '  "suggestedDescription": "기본 안내 설명문 (2~3문장)",\n'
        '  "suggestedFallback": "답변 불가 시 메시지",\n'
        '  "suggestedWelcome": "첫 인사말"\n'
        "}"
    )

    raw = _call_llm(db, system=system_prompt, user=user_prompt)
    if not raw:
        return {
            "success": False,
            "error": "LLM 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
        }

    # 4. JSON 파싱
    try:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return {
                "success": False,
                "error": "AI 분석 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.",
            }
        parsed = json.loads(match.group(0))
        return {
            "success": True,
            "suggestedName":        str(parsed.get("suggestedName") or ""),
            "suggestedRole":        str(parsed.get("suggestedRole") or ""),
            "suggestedDescription": str(parsed.get("suggestedDescription") or ""),
            "suggestedFallback":    str(parsed.get("suggestedFallback") or "죄송합니다. 해당 내용을 찾지 못했습니다."),
            "suggestedWelcome":     str(parsed.get("suggestedWelcome") or "안녕하세요! 무엇을 도와드릴까요?"),
        }
    except Exception as exc:
        logger.warning("[URL_ANALYZER] JSON 파싱 실패: %s raw=%s", exc, raw[:200])
        return {
            "success": False,
            "error": "분석 결과 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
        }

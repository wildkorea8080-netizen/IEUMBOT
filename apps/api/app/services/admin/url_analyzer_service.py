"""
URL 자동 분석 서비스 — AI 기본 설정 자동 구성 (Planee 'AI 자동 설정' 기능).
URL에서 웹사이트 내용을 추출한 후 LLM으로 챗봇 기본 설정값을 제안한다.
"""

import json
import logging
import re
import ssl
import urllib.request
from html.parser import HTMLParser
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_TIMEOUT = 12
_MAX_TEXT = 3000


# ── 간단 HTML → 텍스트 ────────────────────────────────────────────────────────

class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip = False
        self.texts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            text = data.strip()
            if text:
                self.texts.append(text)


def _fetch_text(url: str) -> str:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; IeumBot/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT, context=ctx) as resp:
        raw = resp.read(150_000).decode("utf-8", errors="replace")
    parser = _TextExtractor()
    parser.feed(raw)
    text = " ".join(parser.texts)
    return re.sub(r"\s+", " ", text).strip()[:_MAX_TEXT]


# ── LLM 호출 ─────────────────────────────────────────────────────────────────

def _call_llm(db: Session, system: str, user: str) -> str:
    import urllib.error as _urlerr  # noqa: PLC0415
    from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        return ""

    model = runtime_api.default_model or "gpt-4.1-mini"
    headers = {"Content-Type": "application/json"}

    if runtime_api.provider == "anthropic":
        url = (
            f"{runtime_api.base_url.rstrip('/')}/v1/messages"
            if runtime_api.base_url else "https://api.anthropic.com/v1/messages"
        )
        payload: dict[str, Any] = {
            "model": model, "temperature": 0, "max_tokens": 400,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        headers["x-api-key"] = runtime_api.api_key
        headers["anthropic-version"] = "2023-06-01"
    else:
        url = (
            f"{runtime_api.base_url.rstrip('/')}/responses"
            if runtime_api.base_url else "https://api.openai.com/v1/responses"
        )
        payload = {
            "model": model, "temperature": 0, "max_output_tokens": 400,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": system}]},
                {"role": "user",   "content": [{"type": "input_text", "text": user}]},
            ],
        }
        headers["Authorization"] = f"Bearer {runtime_api.api_key}"

    try:
        req = urllib.request.Request(
            url=url,
            data=json.dumps(payload, ensure_ascii=False).encode(),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())

        if runtime_api.provider == "anthropic":
            for block in result.get("content") or []:
                if isinstance(block, dict) and block.get("type") == "text":
                    return str(block.get("text") or "")
            return ""
        else:
            raw = result.get("output_text") or ""
            if not raw:
                for item in result.get("output") or []:
                    for c in (item.get("content") or []):
                        if isinstance(c, dict) and c.get("type") == "output_text":
                            raw = str(c.get("text") or "")
                            break
            return raw.strip()
    except _urlerr.HTTPError as exc:
        logger.warning("[URL_ANALYZER] LLM HTTP 오류: %s", exc.code)
        return ""
    except Exception as exc:
        logger.warning("[URL_ANALYZER] LLM 오류: %s", exc)
        return ""


# ── 메인 분석 함수 ────────────────────────────────────────────────────────────

def analyze_url_for_chatbot_settings(db: Session, *, url: str) -> dict[str, str]:
    """
    URL 내용 분석 → AI가 챗봇 기본 설정값 제안.
    반환: {suggestedName, suggestedRole, suggestedDescription, suggestedFallback, suggestedWelcome}
    """
    _FALLBACK = {
        "suggestedName": "",
        "suggestedRole": "",
        "suggestedDescription": "",
        "suggestedFallback": "죄송합니다. 해당 내용을 찾지 못했습니다. 담당자에게 문의해 주세요.",
        "suggestedWelcome": "안녕하세요! 무엇을 도와드릴까요?",
    }

    # 1. URL 크롤링
    try:
        page_text = _fetch_text(url)
    except Exception as exc:
        logger.warning("[URL_ANALYZER] 크롤링 실패 url=%s: %s", url, exc)
        return _FALLBACK

    if not page_text.strip():
        return _FALLBACK

    # 2. LLM 분석
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
        '  "suggestedRole": "AI 역할 한 줄 요약 (예: 서울노동권익센터의 노동 법률 상담 AI입니다.)",\n'
        '  "suggestedDescription": "기본 안내 설명문 (2~3문장)",\n'
        '  "suggestedFallback": "답변 불가 시 메시지",\n'
        '  "suggestedWelcome": "첫 인사말"\n'
        "}"
    )

    raw = _call_llm(db, system=system_prompt, user=user_prompt)
    if not raw:
        return _FALLBACK

    # 3. JSON 파싱
    try:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return _FALLBACK
        parsed = json.loads(match.group(0))
        return {
            "suggestedName":        str(parsed.get("suggestedName") or ""),
            "suggestedRole":        str(parsed.get("suggestedRole") or ""),
            "suggestedDescription": str(parsed.get("suggestedDescription") or ""),
            "suggestedFallback":    str(parsed.get("suggestedFallback") or _FALLBACK["suggestedFallback"]),
            "suggestedWelcome":     str(parsed.get("suggestedWelcome") or _FALLBACK["suggestedWelcome"]),
        }
    except Exception as exc:
        logger.warning("[URL_ANALYZER] JSON 파싱 실패: %s", exc)
        return _FALLBACK

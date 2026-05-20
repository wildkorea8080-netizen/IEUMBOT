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


def _detect_charset(content_type_header: str, raw_bytes: bytes) -> str:
    """HTTP 헤더 또는 HTML meta 태그에서 인코딩 감지."""
    # 1) Content-Type 헤더에서
    if "charset=" in content_type_header.lower():
        cs = content_type_header.lower().split("charset=")[-1].split(";")[0].strip()
        if cs:
            return cs
    # 2) HTML <meta charset> 또는 <meta http-equiv="Content-Type"> 에서
    head = raw_bytes[:4096]
    m = re.search(rb'charset=["\']?\s*([A-Za-z0-9_\-]+)', head, re.IGNORECASE)
    if m:
        return m.group(1).decode("ascii", errors="ignore")
    return "utf-8"


def _fetch_text(url: str) -> str:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT, context=ctx) as resp:
        content_type = resp.headers.get("Content-Type", "")
        raw_bytes = resp.read(150_000)

    # 인코딩 감지 (EUC-KR 등 한국 사이트 대응)
    charset = _detect_charset(content_type, raw_bytes)
    try:
        raw = raw_bytes.decode(charset, errors="replace")
    except (LookupError, ValueError):
        raw = raw_bytes.decode("utf-8", errors="replace")

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
    import urllib.error as _urlerr  # noqa: PLC0415
    from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        return ""

    model = runtime_api.speed_model()  # URL 분석: 속도 우선
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

import gzip
import os
import random
import re
import shutil
import ssl
import time
import uuid
import zlib
import logging
from collections.abc import Callable
from typing import Any
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urldefrag, urljoin, urlparse
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.db import SessionLocal
from app.models import Document, DocumentChunk, DocumentVersion, IngestionJob, WebSource
from app.repositories.admin.knowledge_repository import (
    get_document_knowledge_row,
    get_web_source_knowledge_row,
    list_document_knowledge_rows,
    list_web_source_knowledge_rows,
)
from app.schemas.knowledge import (
    KnowledgeDetailResponse,
    KnowledgeItem,
    KnowledgeListResponse,
    KnowledgeRuntimeDependencyItem,
    KnowledgeRuntimeStatusResponse,
    KnowledgeTextCreateRequest,
    KnowledgeUpsertRequest,
    KnowledgeWebsiteCreateRequest,
)
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    ensure_document_in_scope,
    ensure_web_source_in_scope,
    require_institution_organization_id,
)
from app.services.embedding_service import EmbeddingFailure, generate_embedding_or_raise, generate_embeddings_batch

logger = logging.getLogger(__name__)

KNOWLEDGE_STORAGE_DIR = Path(__file__).resolve().parents[3] / "storage" / "knowledge"


def classify_knowledge_topic(
    text: str,
    existing_topics: list[str],
    db: Any,
) -> dict[str, Any]:
    """
    LLM으로 지식 주제 자동 분류 (Sprint 3-C).

    반환:
    {
        "topic": str,
        "is_new_topic": bool,
        "similar_topic": str | None,
        "tags": list[str],
        "has_conflict": bool,
    }

    실패 시 기본값 반환 — 메인 색인 흐름에 영향 없음.
    """
    import json as _json  # noqa: PLC0415
    import urllib.request as _urlreq  # noqa: PLC0415

    _FALLBACK = {
        "topic": "미분류",
        "is_new_topic": False,
        "similar_topic": None,
        "tags": [],
        "has_conflict": False,
    }

    try:
        from app.services.llm_api_config_runtime_service import (  # noqa: PLC0415
            resolve_runtime_api_config as _resolve,
        )
        runtime_api = _resolve(db)
        if runtime_api is None:
            return _FALLBACK

        topics_str = ", ".join(existing_topics[:20]) if existing_topics else "없음"
        system_prompt = "지식 분류 전문가. JSON만 출력."
        user_prompt = (
            f"다음 문서를 분류하세요.\n\n"
            f"기존 주제 목록: {topics_str}\n"
            f"문서 내용 (앞 500자): {text[:500]}\n\n"
            "JSON으로만 응답:\n"
            '{"topic": "분류된 주제명", "is_new_topic": true, '
            '"similar_topic": null, "tags": ["태그1", "태그2", "태그3"], "has_conflict": false}'
        )

        model = runtime_api.speed_model()  # 토픽 분류: 속도 우선
        if runtime_api.provider == "anthropic":
            url = (
                f"{runtime_api.base_url.rstrip('/')}/v1/messages"
                if runtime_api.base_url else "https://api.anthropic.com/v1/messages"
            )
            payload: dict[str, Any] = {
                "model": model, "temperature": 0, "max_tokens": 200,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            }
            headers = {
                "x-api-key": runtime_api.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
        else:
            url = (
                f"{runtime_api.base_url.rstrip('/')}/responses"
                if runtime_api.base_url else "https://api.openai.com/v1/responses"
            )
            payload = {
                "model": model, "temperature": 0, "max_output_tokens": 200,
                "input": [
                    {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
                    {"role": "user", "content": [{"type": "input_text", "text": user_prompt}]},
                ],
            }
            headers = {"Authorization": f"Bearer {runtime_api.api_key}", "Content-Type": "application/json"}

        req = _urlreq.Request(
            url=url,
            data=_json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers, method="POST",
        )
        with _urlreq.urlopen(req, timeout=8) as resp:
            result = _json.loads(resp.read().decode("utf-8"))

        if runtime_api.provider == "anthropic":
            raw = ""
            for block in result.get("content") or []:
                if isinstance(block, dict) and block.get("type") == "text":
                    raw = str(block.get("text") or "")
                    break
        else:
            raw = result.get("output_text") or ""
            if not raw:
                for item in result.get("output") or []:
                    for c in (item.get("content") or []):
                        if isinstance(c, dict) and c.get("type") == "output_text":
                            raw = str(c.get("text") or "")
                            break

        # JSON 추출
        import re as _re  # noqa: PLC0415
        m = _re.search(r"\{.*\}", raw, _re.DOTALL)
        if not m:
            return _FALLBACK
        parsed = _json.loads(m.group(0))
        return {
            "topic": str(parsed.get("topic", "미분류")),
            "is_new_topic": bool(parsed.get("is_new_topic", False)),
            "similar_topic": parsed.get("similar_topic"),
            "tags": list(parsed.get("tags") or []),
            "has_conflict": bool(parsed.get("has_conflict", False)),
        }
    except Exception as exc:
        logger.warning("[CLASSIFY_TOPIC] 실패: %s", exc)
        return _FALLBACK
SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{6}-\d{7}\b"),
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
]
SOURCE_URL_MARKER_REGEX = re.compile(r"\[URL\]\s+(https?://\S+)", re.IGNORECASE)
CLIENT_REDIRECT_REGEX = re.compile(
    r"""(?:location(?:\.href|\.replace)?\s*=\s*|location\.replace\s*\()\s*["']([^"']+)["']""",
    re.IGNORECASE,
)
META_REFRESH_REGEX = re.compile(
    r"""<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"']+)["']""",
    re.IGNORECASE,
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
WEBSITE_REQUEST_TIMEOUT_SECONDS = 15
CRAWL_DELAY_MIN = float(os.getenv("CRAWL_DELAY_MIN", "0.5"))
CRAWL_DELAY_MAX = float(os.getenv("CRAWL_DELAY_MAX", "1.5"))
MAX_CONSECUTIVE_CRAWL_FAILURES = int(os.getenv("CRAWL_MAX_CONSECUTIVE_FAILURES", "5"))
DEFAULT_CRAWL_PAGE_LIMIT = 12
DEFAULT_FULL_SITE_CRAWL_PAGE_LIMIT = 300
MAX_CRAWL_PAGE_LIMIT = 1000
MAX_ATTACHMENT_URLS_PER_CRAWL = int(os.getenv("MAX_ATTACHMENT_URLS_PER_CRAWL", "80"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "120"))
FULL_SITE_CRAWL_DEPTH = 50
PDF_TEXT_SUFFICIENT_LENGTH = 48
PDF_OCR_DPI = 220
PDF_TEXT_MIN_LETTER_RATIO = 0.55
PDF_TEXT_MIN_WORDS = 12
PDF_TEXT_ALLOWED_CHAR_REGEX = re.compile(r"[0-9A-Za-z가-힣\s\.,:/()%\-·&]")
MOJIBAKE_MARKER_REGEX = re.compile(r"(?:�|ì|ë|í|ê|ä|å|æ|媛|蹂|諛|쒖|섏|덈|듬)")
STALE_QUEUED_AFTER = timedelta(minutes=int(os.getenv("INGEST_STALE_QUEUED_MINUTES", "20")))
STALE_PROCESSING_AFTER = timedelta(minutes=int(os.getenv("INGEST_STALE_PROCESSING_MINUTES", "120")))
SKIP_FILE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".zip",
}
CRAWL_EXCLUDED_FILE_EXTENSIONS = {
    ".hwp",
    ".hwpx",
    ".pdf",
    ".zip",
    ".xls",
    ".xlsx",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
}
ATTACHMENT_FILE_EXTENSIONS = {
    ".pdf",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".doc",
    ".docx",
    ".hwp",
    ".hwpx",
}

TEXTISH_MIME_PREFIXES = ("text/",)
ATTACHMENT_MIME_HINTS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".hwp": "application/x-hwp",
    ".hwpx": "application/x-hwpx",
}
UNSUPPORTED_ATTACHMENT_FILE_TYPES = {".doc", ".xls", ".ppt"}
HTML_REMOVED_TAGS = {
    "script",
    "style",
    "meta",
    "link",
    "nav",
    "footer",
    "header",
    "aside",
    "noscript",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "option",
    "iframe",
    "svg",
    "picture",
    "figure",
    "template",
    "slot",
}
HTML_VOID_REMOVED_TAGS = {"meta", "link", "input"}
HTML_BLOCK_TAGS = {
    "address",
    "article",
    "br",
    "dd",
    "div",
    "dl",
    "dt",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "main",
    "p",
    "section",
    "table",
    "td",
    "th",
    "tr",
    "ul",
    "ol",
}
HTML_CONTENT_SELECTORS = (
    ("main", "tag", "main"),
    ("article", "tag", "article"),
    ('[role="main"]', "role", "main"),
    (".content", "class", "content"),
    (".contents", "class", "contents"),
    ("#content", "id", "content"),
    ("#contents", "id", "contents"),
    ("body", "tag", "body"),
)
NAVIGATION_KEYWORDS = (
    "바로가기 메뉴",
    "본문 바로가기",
    "주메뉴 바로가기",
    "메뉴 닫기",
    "사이트맵",
    "KOR",
    "ENG",
    "검색",
    "더보기",
    "자세히 보기",
    "이전글",
    "다음글",
    "개인정보처리방침",
    "TEL",
    "FAX",
    "Copyright",
    "전체메뉴",
    "메뉴닫기",
    "퀵메뉴",
    "화면낭독기",
    "글자크기",
    "고대비",
    "새창열림",
    "새 창",
    "팝업",
    "sns공유",
    "페이스북",
    "트위터",
    "카카오",
    "인쇄하기",
    "스크랩",
    "즐겨찾기추가",
    "페이지 상단으로",
    "TOP",
    "위로가기",
    "이전페이지",
    "다음페이지",
    "조회수",
    "등록일",
    "수정일",
    "담당자",
    "주소",
)
NAVIGATION_KEYWORDS_NORMALIZED = tuple(keyword.lower() for keyword in NAVIGATION_KEYWORDS)
MENU_LINE_KEYWORDS = (
    "신청서 내역 조회",
    "주요사업",
    "세계 속의 우리농업",
    "인력양성",
    "지역분야별 특화교육",
    "국제곡물 전문가 교육",
    "진출기업 보수교육",
    "해외인턴",
    "조사지원",
    "민간환경조사",
    "컨설팅",
    "상시 컨설팅",
    "포럼/워크숍",
    "해외농업 전문관",
    "융자지원",
    "국내반입 및 투자촉진 지원",
    "관련법령",
    "해외시장정보",
    "국가정보",
    "동향정보",
    "해외시장뉴스",
    "통계정보",
    "해외농업투자정보",
    "ODA 정보",
    "자원개발신고",
    "소통알림",
    "공지사항",
    "사업공고",
    "해외진출 상담문의",
    "사이버홍보",
    "포토뉴스",
    "홍보자료",
    "Q&A",
    "FAQ",
    "협회소개",
    "인사말",
    "조직도",
    "회원사 소개",
    "회원사 현황",
    "찾아오시는 길",
    "인기글",
    "손가락을 이용해 좌우로",
)
MENU_LINE_KEYWORDS_NORMALIZED = tuple(keyword.lower() for keyword in MENU_LINE_KEYWORDS)
PHONE_OR_FOOTER_REGEX = re.compile(
    r"(?:\b(?:TEL|FAX)\b|(?:전화|팩스)\s*[:：]?\s*\d{2,4}[-.\s)]?\d{3,4}[-.\s]?\d{4}|Copyright|주소\s*[:：]?)",
    re.IGNORECASE,
)
KOREAN_TEXT_REGEX = re.compile(r"[가-힣]")
KOREAN_SENTENCE_REGEX = re.compile(r"[가-힣][^.!?。！？\n]{8,}[.!?。！？]")
PUNCTUATION_REGEX = re.compile(r"[.!?。！？]")


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._tag_stack: list[tuple[str, dict[str, str]]] = []
        self._candidate_stack: list[str] = []
        self._candidate_chunks: dict[str, list[str]] = {selector[0]: [] for selector in HTML_CONTENT_SELECTORS}
        self._candidate_link_chars: dict[str, int] = {selector[0]: 0 for selector in HTML_CONTENT_SELECTORS}
        self._links: list[str] = []
        self._title_chunks: list[str] = []
        self._in_title = False
        self._heading_tag: str | None = None
        self._heading_chunks: list[str] = []
        self._link_depth = 0
        self.removed_navigation_lines = 0
        self.extraction_method = "body"
        self.navigation_removed = True

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        tag = tag.lower()
        normalized_attrs = {str(key).lower(): str(value or "") for key, value in attrs}
        if tag in HTML_REMOVED_TAGS:
            if tag in HTML_VOID_REMOVED_TAGS:
                return
            self._skip_depth += 1
            return
        if self._skip_depth > 0:
            return

        self._tag_stack.append((tag, normalized_attrs))
        if tag == "title":
            self._in_title = True
        if tag in {"h1", "h2", "h3", "h4"}:
            self._heading_tag = tag
            self._heading_chunks = []
        if tag == "a":
            self._link_depth += 1
            href = normalized_attrs.get("href")
            if isinstance(href, str) and href.strip():
                self._links.append(href.strip())

        for selector_name, selector_type, selector_value in HTML_CONTENT_SELECTORS:
            if self._matches_content_selector(tag, normalized_attrs, selector_type, selector_value):
                self._candidate_stack.append(selector_name)
                self._candidate_chunks[selector_name].append("\n")
        if tag in HTML_BLOCK_TAGS:
            self._append_text("\n")

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        tag = tag.lower()
        if tag in HTML_REMOVED_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if self._skip_depth > 0:
            return

        if tag == "title":
            self._in_title = False
        if tag == self._heading_tag:
            heading_text = " ".join("".join(self._heading_chunks).split()).strip()
            if heading_text:
                level = int(tag[1])
                self._append_text(f"\n{'#' * level} {heading_text}\n")
            self._heading_tag = None
            self._heading_chunks = []
        if tag == "a" and self._link_depth > 0:
            self._link_depth -= 1
        if tag in HTML_BLOCK_TAGS:
            self._append_text("\n")

        if self._tag_stack:
            current_tag, current_attrs = self._tag_stack.pop()
            for selector_name, selector_type, selector_value in reversed(HTML_CONTENT_SELECTORS):
                if current_tag == tag and self._matches_content_selector(
                    current_tag,
                    current_attrs,
                    selector_type,
                    selector_value,
                ):
                    for index in range(len(self._candidate_stack) - 1, -1, -1):
                        if self._candidate_stack[index] == selector_name:
                            del self._candidate_stack[index]
                            break

    def handle_data(self, data: str) -> None:  # type: ignore[override]
        if self._skip_depth > 0:
            return
        if self._in_title:
            self._title_chunks.append(data)
        if self._heading_tag is not None:
            self._heading_chunks.append(data)
            return
        self._append_text(data)

    def _append_text(self, text: str) -> None:
        if not self._candidate_stack:
            return
        for selector_name in self._candidate_stack:
            self._candidate_chunks[selector_name].append(text)
            if self._link_depth > 0:
                self._candidate_link_chars[selector_name] += len(text.strip())

    def _matches_content_selector(
        self,
        tag: str,
        attrs: dict[str, str],
        selector_type: str,
        selector_value: str,
    ) -> bool:
        if selector_type == "tag":
            return tag == selector_value
        if selector_type == "role":
            return attrs.get("role", "").lower() == selector_value
        if selector_type == "id":
            return attrs.get("id", "").lower() == selector_value
        if selector_type == "class":
            classes = {item.strip().lower() for item in attrs.get("class", "").split() if item.strip()}
            return selector_value in classes
        return False

    def _normalize_candidate_text(self, text: str) -> tuple[str, int]:
        lines = [" ".join(line.split()) for line in text.splitlines()]
        normalized_lines: list[str] = []
        removed_navigation_lines = 0
        previous_line = ""
        for line in lines:
            if not line:
                continue
            if _is_navigation_line(line):
                removed_navigation_lines += 1
                continue
            if line == previous_line:
                removed_navigation_lines += 1
                continue
            normalized_lines.append(line)
            previous_line = line
        return "\n".join(normalized_lines).strip(), removed_navigation_lines

    def _score_candidate(self, text: str, link_chars: int) -> float:
        if not text:
            return -100.0
        text_length = len(text)
        korean_chars = len(KOREAN_TEXT_REGEX.findall(text))
        korean_sentence_count = len(KOREAN_SENTENCE_REGEX.findall(text))
        punctuation_bonus = 1.5 if PUNCTUATION_REGEX.search(text) else 0.0
        public_keyword_bonus = 10.0 if any(keyword in text for keyword in ("사업", "지원", "신청", "공고", "안내", "정책")) else 0.0
        nav_keyword_hits = _count_navigation_keyword_hits(text)
        nav_ratio = nav_keyword_hits / max(1, len(text.split()))
        link_ratio = link_chars / max(1, text_length)
        if text_length < 80 or korean_chars < 20:
            return -50.0
        return (
            korean_sentence_count * 5.0
            + punctuation_bonus
            + public_keyword_bonus
            + min(text_length / 1200, 3.0)
            + min(korean_chars / 400, 2.0)
            - nav_ratio * 40.0
            - link_ratio * 25.0
        )

    def get_text(self) -> str:
        best_selector = "body"
        best_text = ""
        best_score = -100.0
        removed_navigation_lines = 0
        scored_candidates: list[tuple[str, str, float, int]] = []
        for selector_name, _selector_type, _selector_value in HTML_CONTENT_SELECTORS:
            raw_text = "".join(self._candidate_chunks.get(selector_name, []))
            candidate_text, removed_count = self._normalize_candidate_text(raw_text)
            link_chars = self._candidate_link_chars.get(selector_name, 0)
            score = self._score_candidate(candidate_text, link_chars)
            scored_candidates.append((selector_name, candidate_text, score, removed_count))
            if score > best_score:
                best_score = score
                best_selector = selector_name
                best_text = candidate_text
                removed_navigation_lines = removed_count
        for selector_name, candidate_text, score, removed_count in scored_candidates:
            if selector_name == "body":
                continue
            if score >= -5.0 and len(candidate_text) >= 100 and _navigation_line_ratio(candidate_text) < 0.45:
                best_selector = selector_name
                best_text = candidate_text
                removed_navigation_lines = removed_count
                break
        self.removed_navigation_lines = removed_navigation_lines
        self.extraction_method = best_selector
        return best_text.strip()

    def get_links(self) -> list[str]:
        return self._links[:]

    def get_title(self) -> str | None:
        title = " ".join("".join(self._title_chunks).split()).strip()
        return title or None


def _parse_date(value: str | None, field_name: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"INVALID_DATE_FORMAT:{field_name}",
        ) from exc


def _iso_date(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _parse_tags(value: str | list[str] | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = value.split(",")
    seen: set[str] = set()
    tags: list[str] = []
    for item in raw_items:
        normalized = str(item).strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            tags.append(normalized)
    return tags


def _truncate_preview(text: str | None, limit: int = 140) -> str | None:
    if not text:
        return None
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1]}..."


def _detect_sensitive(text: str | None) -> bool:
    if not text:
        return False
    return any(pattern.search(text) for pattern in SENSITIVE_PATTERNS)


def _count_navigation_keyword_hits(text: str) -> int:
    lowered = text.lower()
    return sum(lowered.count(keyword) for keyword in NAVIGATION_KEYWORDS_NORMALIZED)


def _is_navigation_line(line: str) -> bool:
    compact = " ".join(line.split()).strip()
    if not compact:
        return True
    lowered = compact.lower()
    if any(keyword in lowered for keyword in NAVIGATION_KEYWORDS_NORMALIZED):
        return True
    if PHONE_OR_FOOTER_REGEX.search(compact):
        return True
    if len(compact) <= 48 and any(keyword == lowered for keyword in MENU_LINE_KEYWORDS_NORMALIZED):
        return True
    if len(compact) <= 70 and any(keyword in lowered for keyword in MENU_LINE_KEYWORDS_NORMALIZED):
        if not PUNCTUATION_REGEX.search(compact) and not re.search(r"\d", compact):
            return True
    if len(compact) <= 18 and not PUNCTUATION_REGEX.search(compact) and not re.search(r"\d", compact):
        menu_words = {"로그인", "회원가입", "HOME", "Home", "목록", "처음", "끝", "닫기", "열기"}
        if compact in menu_words:
            return True
    return False


def _navigation_line_ratio(text: str) -> float:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return 1.0
    navigation_lines = sum(1 for line in lines if _is_navigation_line(line))
    return navigation_lines / len(lines)


def _looks_like_name_or_menu_list(text: str) -> bool:
    compact = " ".join(text.split())
    if not compact:
        return True
    sentence_count = len(KOREAN_SENTENCE_REGEX.findall(compact))
    if sentence_count > 0 or PUNCTUATION_REGEX.search(compact):
        return False
    tokens = [token for token in re.split(r"[\s,·|/]+", compact) if token]
    if len(tokens) < 12:
        return False
    short_token_ratio = sum(1 for token in tokens if len(token) <= 8) / len(tokens)
    has_policy_terms = any(term in compact for term in ("융자", "지원", "조건", "사업", "대상", "신청", "금리", "한도"))
    return short_token_ratio >= 0.82 and not has_policy_terms


def _looks_like_pipe_link_menu(text: str) -> bool:
    pipe_count = text.count("|")
    if pipe_count < 8:
        return False
    segments = [segment.strip() for segment in text.split("|") if segment.strip()]
    if len(segments) < 10:
        return False
    short_segment_ratio = sum(1 for segment in segments if len(segment) <= 24) / len(segments)
    sentence_count = len(KOREAN_SENTENCE_REGEX.findall(text))
    menu_terms = (
        "주요사업",
        "인력양성",
        "조사지원",
        "컨설팅",
        "공지사항",
        "사업공고",
        "협회소개",
        "회원사",
        "FAQ",
        "Q&A",
        "자세히 보기",
        "인기글",
        "포토뉴스",
        "홍보자료",
        "신청서 내역 조회",
    )
    menu_hits = sum(1 for term in menu_terms if term in text)
    return short_segment_ratio >= 0.7 and (sentence_count == 0 or menu_hits >= 3)


def _is_low_quality_chunk(text: str) -> bool:
    compact = " ".join(text.split()).strip()
    if len(compact) < 100:
        return True
    if re.match(r"^https?://", compact, re.IGNORECASE):
        return True
    significant_chars = [char for char in compact if not char.isspace()]
    if significant_chars:
        numeric_or_symbol_chars = sum(1 for char in significant_chars if not re.match(r"[A-Za-z가-힣]", char))
        letter_chars = sum(1 for char in significant_chars if re.match(r"[A-Za-z가-힣]", char))
        if numeric_or_symbol_chars / len(significant_chars) > 0.7:
            return True
        if letter_chars / len(significant_chars) < 0.2:
            return True
    if _looks_like_pipe_link_menu(compact):
        return True
    if _navigation_line_ratio(text) >= 0.35:
        return True
    nav_hits = _count_navigation_keyword_hits(compact)
    token_count = max(1, len(compact.split()))
    if nav_hits / token_count >= 0.08:
        return True
    if PHONE_OR_FOOTER_REGEX.search(compact) and len(KOREAN_SENTENCE_REGEX.findall(compact)) == 0:
        return True
    if _looks_like_name_or_menu_list(compact):
        return True
    korean_chars = len(KOREAN_TEXT_REGEX.findall(compact))
    if korean_chars < 30 and len(KOREAN_SENTENCE_REGEX.findall(compact)) == 0:
        return True
    return False


def _embedding_generated(embedding: list[float] | None) -> bool:
    return bool(embedding)


def _generate_chunk_embedding(
    db: Session,
    *,
    item_id: uuid.UUID,
    chunk_ref: str,
    text: str,
    error_counts: dict[str, int],
) -> list[float] | None:
    try:
        embedding = generate_embedding_or_raise(db, text)
        logger.info("[EMBEDDING] chunk_id=%s status=success", chunk_ref)
        return embedding
    except EmbeddingFailure as exc:
        error_counts[exc.error_code] = error_counts.get(exc.error_code, 0) + 1
        logger.error(
            "[EMBEDDING_ERROR] item_id=%s chunk_id=%s error_code=%s error=%s detail=%s",
            item_id,
            chunk_ref,
            exc.error_code,
            exc.error_message,
            exc.detail or "",
        )
        return None
    except Exception as exc:  # noqa: BLE001
        error_counts["EMBEDDING_API_ERROR"] = error_counts.get("EMBEDDING_API_ERROR", 0) + 1
        logger.exception("[EMBEDDING_ERROR] item_id=%s chunk_id=%s error=%s", item_id, chunk_ref, exc)
        return None


def _summarize_embedding_error(error_counts: dict[str, int]) -> tuple[str, str]:
    if not error_counts:
        return "EMBEDDING_EMPTY", "임베딩이 생성되지 않았습니다."
    error_code = max(error_counts, key=error_counts.get)
    if error_code == "OPENAI_API_KEY_MISSING":
        return error_code, "OpenAI 임베딩 API 설정이 없습니다."
    if error_code == "EMBEDDING_DIMENSION_MISMATCH":
        return error_code, "임베딩 차원이 DB vector 차원과 다릅니다."
    if error_code == "VECTOR_SAVE_ERROR":
        return error_code, "임베딩 벡터를 DB에 저장하지 못했습니다."
    return error_code, "임베딩 생성 중 오류가 발생했습니다."


def _log_ingest_status(
    *,
    knowledge_id: uuid.UUID,
    source_type: str,
    old_status: str | None,
    new_status: str,
    chunk_count: int,
    embedding_count: int,
    reason: str,
) -> None:
    logger.info(
        "[INGEST_STATUS] knowledge_id=%s source_type=%s old_status=%s new_status=%s chunk_count=%s embedding_count=%s reason=%s",
        knowledge_id,
        source_type,
        old_status or "",
        new_status,
        chunk_count,
        embedding_count,
        reason,
    )


def _log_ingest_recovery(
    *,
    knowledge_id: uuid.UUID,
    action: str,
    reason: str,
) -> None:
    logger.warning(
        "[INGEST_RECOVERY] knowledge_id=%s action=%s reason=%s",
        knowledge_id,
        action,
        reason,
    )


def _log_knowledge_diag(
    *,
    item_id: uuid.UUID,
    source_type: str,
    status: str,
    text_length: int,
    chunk_count: int,
    embedding_count: int,
    error: str | None,
) -> None:
    logger.info(
        "[KNOWLEDGE_DIAG] item_id=%s source_type=%s status=%s text_length=%s chunk_count=%s embedding_count=%s error=%s",
        item_id,
        source_type,
        status,
        text_length,
        chunk_count,
        embedding_count,
        error or "",
    )


def _split_text_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict]:
    """
    의미 단위 기반 청킹 (Semantic Chunking).

    분할 우선순위:
    1. 섹션 제목 경계 (###, ##, # 또는 숫자제목 패턴)
    2. 빈 줄 2개 이상 (문단 경계)
    3. 빈 줄 1개 (문단)
    4. 마침표/물음표/느낌표 뒤 줄바꿈 (문장 경계)
    5. chunk_size 초과 시 강제 분할 (overlap 적용)

    반환: [{"text": str, "section_title": str | None}, ...]
    """
    import re

    if not text or not text.strip():
        return []

    SECTION_PATTERNS = [
        (re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE), True),
        (re.compile(r"^(\d+[\.\d]*\.?\s+|제\d+[조장절항]\s*)(.{2,30})$", re.MULTILINE), True),
        (re.compile(r"^[가나다라마바사아자차카타파하]\.\s+(.{2,30})$", re.MULTILINE), False),
        (re.compile(r"^[\[\【](.{2,20})[\]\】]$", re.MULTILINE), True),
    ]

    lines = text.split("\n")
    sections: list[tuple[str | None, list[str]]] = []

    current_title: str | None = None
    current_lines: list[str] = []

    for line in lines:
        detected_title = None
        is_strong_section = False
        for pattern, strong_section in SECTION_PATTERNS:
            m = pattern.match(line.strip())
            if m:
                detected_title = m.group(m.lastindex).strip()
                is_strong_section = strong_section
                break

        if detected_title and not is_strong_section and current_title:
            current_lines.append(line)
            continue

        if detected_title and current_lines:
            sections.append((current_title, current_lines))
            current_title = detected_title
            current_lines = [line]
        else:
            if detected_title:
                current_title = detected_title
            current_lines.append(line)

    if current_lines:
        sections.append((current_title, current_lines))

    chunks: list[dict] = []

    for section_title, section_lines in sections:
        section_text = "\n".join(section_lines).strip()
        if not section_text:
            continue

        if len(section_text) <= chunk_size:
            chunks.append(
                {
                    "text": section_text,
                    "section_title": section_title,
                }
            )
        else:
            sub_chunks = _split_section_into_chunks(
                section_text,
                section_title=section_title,
                chunk_size=chunk_size,
                overlap=overlap,
            )
            chunks.extend(sub_chunks)

    return [c for c in chunks if c["text"].strip() and len(c["text"].strip()) >= 20]


def _split_section_into_chunks(
    text: str,
    *,
    section_title: str | None,
    chunk_size: int,
    overlap: int,
) -> list[dict]:
    """
    섹션 내부를 문단/문장 경계로 분할.
    chunk_size 초과 시 overlap 적용.
    """
    import re

    paragraphs = re.split(r"\n{2,}", text)

    chunks: list[dict] = []
    buffer = ""
    step = max(1, chunk_size - overlap)

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(buffer) + len(para) + 1 <= chunk_size:
            buffer = (buffer + "\n\n" + para).strip()
        else:
            if buffer:
                chunks.append(
                    {
                        "text": buffer,
                        "section_title": section_title,
                    }
                )
                overlap_text = buffer[-overlap:] if len(buffer) > overlap else buffer
                buffer = (overlap_text + "\n\n" + para).strip()
            else:
                sentences = re.split(r"(?<=[.!?。？！])\s+", para)
                sent_buffer = ""
                for sent in sentences:
                    if len(sent_buffer) + len(sent) + 1 <= chunk_size:
                        sent_buffer = (sent_buffer + " " + sent).strip()
                    else:
                        if sent_buffer:
                            chunks.append(
                                {
                                    "text": sent_buffer,
                                    "section_title": section_title,
                                }
                            )
                            sent_buffer = sent
                        else:
                            for i in range(0, len(sent), step):
                                chunks.append(
                                    {
                                        "text": sent[i : i + chunk_size],
                                        "section_title": section_title,
                                    }
                                )
                            sent_buffer = ""
                if sent_buffer:
                    buffer = sent_buffer
                continue

    if buffer:
        chunks.append(
            {
                "text": buffer,
                "section_title": section_title,
            }
        )

    return chunks


def _split_text_chunks_semantic(
    text: str,
    max_chunk_size: int = CHUNK_SIZE,
    overlap_size: int = CHUNK_OVERLAP,
    section_title: str = "",
) -> list[dict]:
    """
    표 보호 + 의미 단위 청킹 (Sprint 1-A).

    처리 순서:
    1. 표 블록(파이프 2줄 이상) 추출 → placeholder(__TABLE_N__) 치환
    2. \\n\\n 기준 단락 분할
    3. 단락이 max_chunk_size 초과 시 한국어 문장 경계 분할
    4. 100자 미만 소형 조각은 앞 조각에 병합 (표 블록 제외)
    5. 인접 청크 앞에 overlap_size 글자 접두 추가
    6. placeholder → 원래 표 복원

    반환: [{"text": str, "section_title": str | None}, ...]
    """
    import re as _re

    if not text or not text.strip():
        return []

    # ── 1. 표 감지 및 보호 ────────────────────────────────────────────────
    table_blocks: list[str] = []
    _TABLE_LINE = _re.compile(r"^\s*\|.+\|")  # | 로 시작하고 | 로 끝나는 줄

    def _extract_tables(src: str) -> str:
        lines = src.split("\n")
        out: list[str] = []
        i = 0
        while i < len(lines):
            if _TABLE_LINE.match(lines[i]):
                j = i
                while j < len(lines) and (
                    _TABLE_LINE.match(lines[j]) or lines[j].strip().startswith("|") or lines[j].strip() == ""
                ):
                    # 빈 줄은 표 연속으로 허용하되 2줄 연속 빈 줄은 종료
                    if lines[j].strip() == "":
                        if j + 1 < len(lines) and lines[j + 1].strip() == "":
                            break
                    j += 1
                candidate = lines[i:j]
                table_lines = [ln for ln in candidate if ln.strip()]
                if len(table_lines) >= 2 and all(_TABLE_LINE.match(ln) or ln.strip().startswith("|") for ln in table_lines):
                    idx = len(table_blocks)
                    table_blocks.append("\n".join(candidate))
                    out.append(f"__TABLE_{idx}__")
                    i = j
                    continue
            out.append(lines[i])
            i += 1
        return "\n".join(out)

    working = _extract_tables(text)

    # ── 2. 단락 분할 (\n\n 기준) ───────────────────────────────────────────
    paragraphs = _re.split(r"\n{2,}", working)

    # ── 3. 초과 단락 → 문장 분할 ──────────────────────────────────────────
    # 한국어 문장 끝 패턴 우선, 이후 일반 마침표 패턴
    _KO_SENT_END = _re.compile(
        r"(?<=[다요까])(?:\. |! |\? )"   # 다. 요. 까. 다! 요! 다? 요?
        r"|(?<=[.!?]) "                   # 일반 마침표 뒤 공백
    )

    def _sentence_split(para: str) -> list[str]:
        parts = _KO_SENT_END.split(para)
        return [p.strip() for p in parts if p.strip()]

    raw_chunks: list[str] = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if para.startswith("__TABLE_"):
            raw_chunks.append(para)
            continue

        if len(para) <= max_chunk_size:
            raw_chunks.append(para)
            continue

        # 단락 초과 → 문장 분할
        sentences = _sentence_split(para)
        if len(sentences) <= 1:
            # 문장 분할 불가 → 강제 슬라이딩
            step = max(1, max_chunk_size - overlap_size)
            for i in range(0, len(para), step):
                raw_chunks.append(para[i : i + max_chunk_size])
        else:
            buf = ""
            for sent in sentences:
                if len(buf) + len(sent) + 1 <= max_chunk_size:
                    buf = (buf + " " + sent).strip() if buf else sent
                else:
                    if buf:
                        raw_chunks.append(buf)
                    buf = sent
            if buf:
                raw_chunks.append(buf)

    # ── 4. 소형 조각 병합 (100자 미만, 표 블록 제외) ──────────────────────
    merged: list[str] = []
    for chunk in raw_chunks:
        is_table = chunk.startswith("__TABLE_")
        if (
            not is_table
            and len(chunk) < 100
            and merged
            and not merged[-1].startswith("__TABLE_")
        ):
            merged[-1] = merged[-1] + "\n\n" + chunk
        else:
            merged.append(chunk)

    # ── 5. 오버랩 적용 ────────────────────────────────────────────────────
    with_overlap: list[str] = []
    for i, chunk in enumerate(merged):
        if (
            i == 0
            or chunk.startswith("__TABLE_")
            or merged[i - 1].startswith("__TABLE_")
        ):
            with_overlap.append(chunk)
        else:
            prev = merged[i - 1]
            prefix = prev[-overlap_size:] if len(prev) > overlap_size else prev
            with_overlap.append(prefix + "\n" + chunk)

    # ── 6. 표 placeholder 복원 ────────────────────────────────────────────
    def _restore(chunk: str) -> str:
        for idx, table_text in enumerate(table_blocks):
            chunk = chunk.replace(f"__TABLE_{idx}__", table_text)
        return chunk

    resolved_title: str | None = section_title.strip() or None
    result: list[dict] = []
    for chunk in with_overlap:
        restored = _restore(chunk).strip()
        if restored and len(restored) >= 20:
            result.append({"text": restored, "section_title": resolved_title})

    return result


def _strip_website_block_markers(block: str) -> tuple[dict[str, str], str]:
    metadata: dict[str, str] = {}
    content_lines: list[str] = []
    marker_keys = {
        "[URL]": "url",
        "[TITLE]": "page_title",
        "[FINAL_URL]": "final_url",
        "[EXTRACTION_METHOD]": "extraction_method",
        "[NAVIGATION_REMOVED]": "navigation_removed",
    }
    for line in block.splitlines():
        stripped = line.strip()
        matched_marker = False
        for marker, key in marker_keys.items():
            if stripped.upper().startswith(marker):
                metadata[key] = stripped[len(marker) :].strip()
                matched_marker = True
                break
        if not matched_marker:
            content_lines.append(line)
    return metadata, "\n".join(content_lines).strip()


def _infer_section_title(chunk_text: str, *, default_title: str) -> str:
    for line in chunk_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("[ATTACHMENT]"):
            return stripped
        if len(stripped) <= 80 and not stripped.endswith((".", "?", "!", "。", "！", "？")):
            return stripped
        break
    return default_title


def _split_website_blocks(combined_text: str) -> list[str]:
    blocks: list[str] = []
    current_lines: list[str] = []
    for line in combined_text.splitlines():
        stripped = line.strip()
        starts_page = stripped.upper().startswith("[URL]") and (
            not current_lines or not current_lines[0].strip().upper().startswith("[ATTACHMENT]")
        )
        starts_attachment = stripped.upper().startswith("[ATTACHMENT]")
        if current_lines and (starts_page or starts_attachment):
            block = "\n".join(current_lines).strip()
            if block:
                blocks.append(block)
            current_lines = []
        current_lines.append(line)
    if current_lines:
        block = "\n".join(current_lines).strip()
        if block:
            blocks.append(block)
    return blocks


def _split_website_chunks(
    combined_text: str,
    *,
    default_title: str,
    chunk_size: int = CHUNK_SIZE,
) -> list[dict[str, str | None]]:
    items: list[dict[str, str | None]] = []
    blocks = _split_website_blocks(combined_text.strip())
    for block in blocks:
        marker_metadata, content_text = _strip_website_block_markers(block)
        marker = SOURCE_URL_MARKER_REGEX.search(block)
        source_url = marker_metadata.get("url") or (marker.group(1).strip() if marker else None)
        page_title = marker_metadata.get("page_title") or default_title
        final_url = marker_metadata.get("final_url") or source_url
        extraction_method = marker_metadata.get("extraction_method")
        navigation_removed = marker_metadata.get("navigation_removed")
        candidate_chunks = _split_text_chunks(content_text, chunk_size=chunk_size)
        for chunk_item in candidate_chunks:
            chunk_text = str(chunk_item.get("text") or "")
            if _is_low_quality_chunk(chunk_text):
                continue
            section_title = chunk_item.get("section_title") or _infer_section_title(chunk_text, default_title=page_title)
            items.append(
                {
                    "text": chunk_text,
                    "url": source_url,
                    "section_title": section_title,
                    "page_title": page_title,
                    "final_url": final_url,
                    "extraction_method": extraction_method,
                    "navigation_removed": navigation_removed,
                }
            )
    if items:
        return items
    return []


def _detect_client_redirect_url(html: str, *, base_url: str) -> str | None:
    for pattern in (CLIENT_REDIRECT_REGEX, META_REFRESH_REGEX):
        match = pattern.search(html)
        if not match:
            continue
        redirect_target = match.group(1).strip()
        if redirect_target:
            return urljoin(base_url, redirect_target)
    return None


class _WebsiteFetchSkipped(Exception):
    def __init__(self, url: str, status_code: int | None, reason: str) -> None:
        self.url = url
        self.status_code = status_code
        self.reason = reason
        super().__init__(f"{reason}: {url} status={status_code or ''}".strip())


def _website_request_headers(accept: str) -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
    }


def _decode_website_payload(payload: bytes, *, content_type: str | None, content_encoding: str | None) -> str:
    encoding = (content_encoding or "").lower()
    if "gzip" in encoding:
        payload = gzip.decompress(payload)
    elif "deflate" in encoding:
        try:
            payload = zlib.decompress(payload)
        except zlib.error:
            payload = zlib.decompress(payload, -zlib.MAX_WBITS)

    charset = None
    if content_type:
        match = re.search(r"charset\s*=\s*['\"]?([^;'\"]+)", content_type, re.IGNORECASE)
        if match:
            charset = match.group(1).strip()
    if not charset:
        sample = payload[:4096].decode("ascii", errors="ignore")
        match = re.search(r"<meta[^>]+charset\s*=\s*['\"]?\s*([A-Za-z0-9._-]+)", sample, re.IGNORECASE)
        if match:
            charset = match.group(1).strip()
    if not charset:
        try:
            from charset_normalizer import from_bytes

            detected = from_bytes(payload).best()
            if detected and detected.encoding:
                charset = detected.encoding
        except Exception:  # noqa: BLE001
            try:
                import chardet

                detected = chardet.detect(payload)
                if detected.get("encoding"):
                    charset = str(detected["encoding"])
            except Exception:  # noqa: BLE001
                charset = None
    return payload.decode(charset or "utf-8", errors="replace")


def _read_website_response(response) -> tuple[str, str, int | None]:
    content_type = response.headers.get("Content-Type")
    content_encoding = response.headers.get("Content-Encoding")
    html = _decode_website_payload(
        response.read(),
        content_type=content_type,
        content_encoding=content_encoding,
    )
    final_url = response.geturl()
    http_status_code = getattr(response, "status", None)
    return html, final_url, http_status_code


def _fetch_website_page_once(url: str) -> tuple[str, str, int | None]:
    request = Request(
        url,
        headers=_website_request_headers("text/html,application/xhtml+xml,*/*;q=0.9"),
    )
    opener = build_opener(
        ProxyHandler({}),
        HTTPSHandler(context=ssl.create_default_context()),
    )
    for attempt in range(2):
        try:
            with opener.open(request, timeout=WEBSITE_REQUEST_TIMEOUT_SECONDS) as response:
                return _read_website_response(response)
        except HTTPError as exc:
            status_code = exc.code
            if status_code == 429 and attempt == 0:
                logger.warning("[WEB_FETCH_RETRY] url=%s status=429 wait_seconds=3", url)
                time.sleep(3)
                continue
            if status_code == 404:
                logger.info("[WEB_FETCH_SKIP] url=%s status=404 reason=not_found", url)
                raise _WebsiteFetchSkipped(url, status_code, "not_found") from exc
            if status_code in {401, 403}:
                logger.warning("[WEB_FETCH_SKIP] url=%s status=%s reason=access_denied", url, status_code)
                raise _WebsiteFetchSkipped(url, status_code, "access_denied") from exc
            if 500 <= status_code <= 599:
                logger.warning("[WEB_FETCH_SKIP] url=%s status=%s reason=server_error", url, status_code)
                raise _WebsiteFetchSkipped(url, status_code, "server_error") from exc
            raise
    raise _WebsiteFetchSkipped(url, 429, "rate_limited")


def _fetch_website_page(url: str) -> tuple[str, str, list[str], str, int | None, str | None, str, bool, int]:
    html, final_url, http_status_code = _fetch_website_page_once(url)
    extractor = _HTMLTextExtractor()
    extractor.feed(html)
    text = extractor.get_text()
    redirect_url = _detect_client_redirect_url(html, base_url=final_url or url) if not text else None
    if redirect_url and redirect_url != final_url:
        redirect_url = _normalize_crawl_url(final_url or url, redirect_url)
    if redirect_url and redirect_url != final_url:
        html, final_url, http_status_code = _fetch_website_page_once(redirect_url)
        extractor = _HTMLTextExtractor()
        extractor.feed(html)
        text = extractor.get_text()
    return (
        html,
        text,
        extractor.get_links(),
        final_url,
        http_status_code,
        extractor.get_title(),
        extractor.extraction_method,
        extractor.navigation_removed,
        extractor.removed_navigation_lines,
    )


def _fetch_binary_resource(url: str) -> tuple[bytes, str | None]:
    request = Request(
        url,
        headers=_website_request_headers("*/*"),
    )
    opener = build_opener(
        ProxyHandler({}),
        HTTPSHandler(context=ssl.create_default_context()),
    )
    with opener.open(request, timeout=WEBSITE_REQUEST_TIMEOUT_SECONDS) as response:
        content_type = response.headers.get_content_type()
        payload = response.read()
    return payload, content_type


def _serialize_attachment_items(
    items: list[dict[str, object]],
) -> list[dict[str, str | int | bool | None]]:
    normalized_items: list[dict[str, str | int | bool | None]] = []
    for item in items:
        normalized_items.append(
            {
                "url": str(item.get("url")) if item.get("url") is not None else None,
                "file_name": str(item.get("file_name")) if item.get("file_name") is not None else None,
                "file_type": str(item.get("file_type")) if item.get("file_type") is not None else None,
                "mime_type": str(item.get("mime_type")) if item.get("mime_type") is not None else None,
                "text_length": int(item.get("text_length")) if item.get("text_length") is not None else None,
                "extracted": bool(item.get("extracted")) if item.get("extracted") is not None else None,
                "extraction_method": str(item.get("extraction_method")) if item.get("extraction_method") is not None else None,
                "extraction_status": (
                    str(item.get("extraction_status")) if item.get("extraction_status") is not None else None
                ),
                "error_message": str(item.get("error_message")) if item.get("error_message") is not None else None,
            }
        )
    return normalized_items


def _write_extracted_text_to_storage(file_name: str, extracted_text: str) -> Path:
    KNOWLEDGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(file_name or "document.txt").suffix.lower()
    storage_suffix = f"{suffix}.txt" if suffix else ".txt"
    storage_name = f"{uuid.uuid4()}{storage_suffix}"
    storage_path = KNOWLEDGE_STORAGE_DIR / storage_name
    storage_path.write_text(extracted_text, encoding="utf-8")
    return storage_path


def _resolve_reindex_storage_path(document: Document, version: DocumentVersion) -> Path | None:
    metadata = dict(document.metadata_json or {})
    candidate_values = [
        metadata.get("original_storage_key"),
        version.storage_key,
        metadata.get("extracted_text_storage_key"),
    ]
    for value in candidate_values:
        candidate = str(value or "").strip()
        if not candidate:
            continue
        path = Path(candidate)
        if path.is_file():
            return path
    return None


def _rebuild_text_from_existing_chunks(db: Session, document: Document, version: DocumentVersion) -> str:
    stmt = (
        select(DocumentChunk.text_content)
        .where(DocumentChunk.document_id == document.id)
        .where(DocumentChunk.document_version_id == version.id)
        .order_by(DocumentChunk.chunk_order.asc())
    )
    chunks = [str(value or "").strip() for value in db.execute(stmt).scalars().all()]
    return "\n\n".join(chunk for chunk in chunks if chunk).strip()


def _load_rag_settings_for_chatbot(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> dict | None:
    try:
        from app.services.settings.answer_settings_service import (
            get_effective_answer_settings_for_runtime,
        )

        answer_settings = get_effective_answer_settings_for_runtime(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
        )
        rag = answer_settings.rag
        return {
            "chunkSize": rag.chunk_size,
            "chunkOverlap": rag.chunk_overlap,
            "crawlDelayMin": rag.crawl_delay_min,
            "crawlDelayMax": rag.crawl_delay_max,
            "crawlMaxConsecutiveFailures": rag.crawl_max_consecutive_failures,
        }
    except Exception:
        logger.exception(
            "[RAG_SETTINGS] failed to load; using defaults chatbot_id=%s",
            chatbot_id,
        )
        return None


def _ingest_document_version_content(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    document: Document,
    version: DocumentVersion,
    job: IngestionJob | None,
    file_name: str,
    file_bytes: bytes,
    content_type: str | None,
    metadata_updates: dict | None = None,
    rag_settings: dict | None = None,
    use_vision: bool = False,
) -> None:
    now = datetime.now(UTC)
    old_version_status = version.status
    if job is not None:
        job.status = "processing"
        job.current_step = "extracting"
        job.progress_percent = 20
        job.started_at = now
        job.attempt_count = (job.attempt_count or 0) + 1
    version.status = "processing"
    db.flush()

    extracted_text, detected_file_type, extraction_method = _extract_document_text(
        file_name,
        file_bytes,
        content_type,
        use_vision=use_vision,
        db=db,
    )
    extracted_text = extracted_text.strip()
    if detected_file_type == ".pdf" and extracted_text and _looks_like_mojibake_text(extracted_text):
        extracted_text = ""
        extraction_method = "failed"
        if metadata_updates is not None:
            metadata_updates = {
                **metadata_updates,
                "pdf_warning": "MOJIBAKE_TEXT_DETECTED",
            }
    if not extracted_text:
        version.status = "failed"
        version.error_code = "MOJIBAKE_TEXT_DETECTED" if detected_file_type == ".pdf" and extraction_method == "failed" else "EMPTY_DOCUMENT_TEXT"
        version.extracted_text_length = 0
        version.chunk_count = 0
        version.embedding_count = 0
        version.processed_at = now
        version.error_message = (
            "PDF 텍스트가 깨져 색인하지 않았습니다. OCR 환경 또는 원본 PDF를 확인해 주세요."
            if version.error_code == "MOJIBAKE_TEXT_DETECTED"
            else "문서에서 색인 가능한 텍스트를 추출하지 못했습니다."
        )
        document.status = "failed"
        if job is not None:
            job.status = "failed"
            job.current_step = "failed"
            job.progress_percent = 100
            job.error_code = version.error_code
            job.error_message = version.error_message
            job.finished_at = now
        _log_ingest_status(
            knowledge_id=document.id,
            source_type=version.source_type,
            old_status=old_version_status,
            new_status=version.status,
            chunk_count=0,
            embedding_count=0,
            reason=version.error_code or "EMPTY_DOCUMENT_TEXT",
        )
        _log_knowledge_diag(
            item_id=document.id,
            source_type=version.source_type,
            status=version.status,
            text_length=0,
            chunk_count=0,
            embedding_count=0,
            error=version.error_message,
        )
        return

    if job is not None:
        job.current_step = "chunking"
        job.progress_percent = 55
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    for previous_version in document.versions:
        if previous_version.id != version.id:
            previous_version.is_active = False
    db.flush()

    extracted_text_storage_path = _write_extracted_text_to_storage(file_name, extracted_text)
    if version.source_type != "file":
        version.storage_key = str(extracted_text_storage_path)
    version.file_size_bytes = len(file_bytes)
    version.mime_type = content_type or ATTACHMENT_MIME_HINTS.get(detected_file_type, "application/octet-stream")
    if version.source_type == "text":
        version.mime_type = "text/plain"
    version.checksum_sha256 = sha256(extracted_text.encode("utf-8")).hexdigest()
    version.error_code = None
    version.error_message = None

    _chunk_size = int((rag_settings or {}).get("chunkSize", CHUNK_SIZE))
    _chunk_overlap = int((rag_settings or {}).get("chunkOverlap", CHUNK_OVERLAP))
    _use_semantic_v2 = bool((rag_settings or {}).get("semanticChunking", False))
    if _use_semantic_v2:
        chunks = _split_text_chunks_semantic(
            extracted_text,
            max_chunk_size=_chunk_size,
            overlap_size=_chunk_overlap,
        )
    else:
        chunks = _split_text_chunks(
            extracted_text,
            chunk_size=_chunk_size,
            overlap=_chunk_overlap,
        )
    version.extracted_text_length = len(extracted_text)
    version.chunk_count = len(chunks)
    if not chunks:
        version.status = "failed"
        version.error_code = "EMPTY_DOCUMENT_CHUNKS"
        version.embedding_count = 0
        version.processed_at = now
        version.error_message = "문서에서 생성된 청크가 없습니다."
        document.status = "failed"
        if job is not None:
            job.status = "failed"
            job.current_step = "failed"
            job.progress_percent = 100
            job.error_code = "EMPTY_DOCUMENT_CHUNKS"
            job.error_message = version.error_message
            job.finished_at = now
        _log_ingest_status(
            knowledge_id=document.id,
            source_type=version.source_type,
            old_status=old_version_status,
            new_status=version.status,
            chunk_count=0,
            embedding_count=0,
            reason=version.error_code or "EMPTY_DOCUMENT_CHUNKS",
        )
        _log_knowledge_diag(
            item_id=document.id,
            source_type=version.source_type,
            status=version.status,
            text_length=version.extracted_text_length or 0,
            chunk_count=0,
            embedding_count=0,
            error=version.error_message,
        )
        return

    merged_metadata = {
        **dict(document.metadata_json or {}),
        **(metadata_updates or {}),
        "summary": _truncate_preview(extracted_text, 220) or file_name,
        "content_preview": _truncate_preview(extracted_text, 220),
        "sensitive_detected": _detect_sensitive(extracted_text),
        "extracted_text_storage_key": str(extracted_text_storage_path),
        "extraction_method": extraction_method,
    }
    document.metadata_json = merged_metadata
    document.description = _truncate_preview(extracted_text, 220)
    document.status = "active"
    document.processed_at = now
    document.current_version_id = version.id

    embedding_count = 0
    embedding_error_counts: dict[str, int] = {}
    embedding_texts = [
        f"{str(chunk_item.get('section_title') or document.title)}\n{str(chunk_item.get('text') or '')}"
        for chunk_item in chunks
    ]
    embeddings = generate_embeddings_batch(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        texts=embedding_texts,
    )
    for index, chunk_item in enumerate(chunks, start=1):
        chunk_text = str(chunk_item.get("text") or "")
        section_title = str(chunk_item.get("section_title") or document.title)
        embedding = embeddings[index - 1] if index - 1 < len(embeddings) else None
        if _embedding_generated(embedding):
            embedding_count += 1
        else:
            embedding_error_counts["EMBEDDING_BATCH_FAILED"] = (
                embedding_error_counts.get("EMBEDDING_BATCH_FAILED", 0) + 1
            )
        # text_search_vector: section_title + text_content 를 'simple' 사전으로 색인
        # to_tsvector는 서버사이드 함수이므로 insert 시 func.to_tsvector() 로 전달
        # 마이그레이션 미실행 환경에서는 컬럼 자체가 없으므로 try/except 로 보호
        _tsv_value = func.to_tsvector(
            "simple",
            (section_title + " " + chunk_text) if section_title else chunk_text,
        )
        db.add(
            DocumentChunk(
                organization_id=uuid.UUID(organization_id),
                document_id=document.id,
                chatbot_id=uuid.UUID(chatbot_id),
                document_version_id=version.id,
                chunk_order=index,
                page_number=None,
                section_title=section_title,
                corpus_domain=version.corpus_domain,
                text_content=chunk_text,
                metadata_json={
                    **merged_metadata,
                    "sourceType": merged_metadata.get("sourceType") or version.source_type,
                    "section_title": section_title,
                },
                embedding=embedding,
                token_count=len(chunk_text.split()),
                content_hash=sha256(chunk_text.encode("utf-8")).hexdigest(),
                text_search_vector=_tsv_value,
            )
        )
        try:
            db.flush()
        except SQLAlchemyError as exc:
            err_msg = str(exc).lower()
            # text_search_vector 컬럼이 아직 없는 경우(마이그레이션 미실행) —
            # tsv 없이 재시도. 운영 DB 에서는 마이그레이션 후 이 경로를 타지 않음.
            if "text_search_vector" in err_msg or "undefined column" in err_msg:
                db.rollback()
                db.add(
                    DocumentChunk(
                        organization_id=uuid.UUID(organization_id),
                        document_id=document.id,
                        chatbot_id=uuid.UUID(chatbot_id),
                        document_version_id=version.id,
                        chunk_order=index,
                        page_number=None,
                        section_title=section_title,
                        corpus_domain=version.corpus_domain,
                        text_content=chunk_text,
                        metadata_json={
                            **merged_metadata,
                            "sourceType": merged_metadata.get("sourceType") or version.source_type,
                            "section_title": section_title,
                        },
                        embedding=embedding,
                        token_count=len(chunk_text.split()),
                        content_hash=sha256(chunk_text.encode("utf-8")).hexdigest(),
                    )
                )
                db.flush()
            else:
                logger.exception(
                    "[EMBEDDING_ERROR] chunk_id=%s error_code=VECTOR_SAVE_ERROR error=%s",
                    f"{document.id}:{index}",
                    exc,
                )
                raise

    version.file_name = file_name
    version.processed_at = now
    version.embedding_count = embedding_count
    logger.info(
        "[EMBEDDING] requested=%s success=%s failed=%s",
        len(chunks),
        embedding_count,
        len(chunks) - embedding_count,
    )
    if embedding_count < len(chunks):
        logger.warning(
            "Knowledge embedding count is lower than chunk count: item_id=%s chunk_count=%s embedding_count=%s",
            document.id,
            len(chunks),
            embedding_count,
        )
    if embedding_count == 0:
        version.status = "failed"
        version.error_code, version.error_message = _summarize_embedding_error(embedding_error_counts)
        document.status = "failed"
    else:
        version.status = "completed"
        version.error_code = None
        version.error_message = None
    version.is_active = True
    if job is not None:
        _clear_stale_recovery_metadata(job)
        job.status = version.status
        job.current_step = "failed" if version.status == "failed" else "completed"
        job.progress_percent = 100
        job.error_code = version.error_code
        job.error_message = version.error_message
        job.finished_at = now
    _log_ingest_status(
        knowledge_id=document.id,
        source_type=version.source_type,
        old_status=old_version_status,
        new_status=version.status,
        chunk_count=version.chunk_count or 0,
        embedding_count=version.embedding_count or 0,
        reason=version.error_code or "completed",
    )
    _log_knowledge_diag(
        item_id=document.id,
        source_type=version.source_type,
        status=version.status,
        text_length=version.extracted_text_length or 0,
        chunk_count=version.chunk_count or 0,
        embedding_count=version.embedding_count or 0,
        error=version.error_message,
    )


def _sync_web_source_attachment_documents(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    web_source: WebSource,
    web_metadata: dict,
    attachment_items: list[dict[str, object]],
    rag_settings: dict | None = None,
) -> None:
    now = datetime.now(UTC)
    existing_docs = _list_web_source_attachment_documents(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        web_source_id=str(web_source.id),
    )
    existing_by_url = {
        str(doc.metadata_json.get("attachment_url")): doc
        for doc in existing_docs
        if doc.metadata_json.get("attachment_url")
    }
    current_urls = {
        str(item.get("url"))
        for item in attachment_items
        if item.get("url") and str(item.get("extracted_text") or "").strip()
    }

    for doc in existing_docs:
        attachment_url = str(doc.metadata_json.get("attachment_url") or "")
        if attachment_url and attachment_url not in current_urls:
            doc.deleted_at = now
            doc.status = "deprecated"

    for item in attachment_items:
        attachment_url = str(item.get("url") or "").strip()
        if not attachment_url:
            continue
        extracted_text = str(item.get("extracted_text") or "").strip()
        if not extracted_text:
            continue
        file_name = str(item.get("file_name") or _guess_file_name_from_url(attachment_url))
        file_type = str(item.get("file_type") or _guess_file_type_from_url(attachment_url))
        mime_type = str(item.get("mime_type") or ATTACHMENT_MIME_HINTS.get(file_type) or "application/octet-stream")
        existing = existing_by_url.get(attachment_url)

        if existing is None:
            existing = Document(
                organization_id=uuid.UUID(organization_id),
                chatbot_id=uuid.UUID(chatbot_id),
                title=file_name,
                category=web_metadata.get("category"),
                corpus_domain="official_website_indexed",
                description=_truncate_preview(extracted_text, 220),
                status="active",
                uploaded_at=now,
                metadata_json={
                    "sourceType": "website_attachment",
                    "web_source_id": str(web_source.id),
                    "attachment_url": attachment_url,
                    "parent_website_url": web_source.base_url,
                    "field": web_metadata.get("field"),
                    "tags": _parse_tags(web_metadata.get("tags")),
                    "memo": web_metadata.get("memo"),
                    "department": web_metadata.get("department"),
                    "summary": _truncate_preview(extracted_text, 220) or file_name,
                    "sensitive_detected": _detect_sensitive(extracted_text),
                },
            )
            db.add(existing)
            db.flush()
        else:
            existing.deleted_at = None
            existing.title = file_name
            existing.category = web_metadata.get("category")
            existing.corpus_domain = "official_website_indexed"
            existing.description = _truncate_preview(extracted_text, 220)
            existing.status = "active"
            existing.metadata_json = {
                **dict(existing.metadata_json or {}),
                "sourceType": "website_attachment",
                "web_source_id": str(web_source.id),
                "attachment_url": attachment_url,
                "parent_website_url": web_source.base_url,
                "field": web_metadata.get("field"),
                "tags": _parse_tags(web_metadata.get("tags")),
                "memo": web_metadata.get("memo"),
                "department": web_metadata.get("department"),
                "summary": _truncate_preview(extracted_text, 220) or file_name,
                "sensitive_detected": _detect_sensitive(extracted_text),
            }
            db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == existing.id))
            for previous_version in existing.versions:
                previous_version.is_active = False
            db.flush()

        next_version_number = max((version.version_number for version in existing.versions), default=0) + 1
        version = DocumentVersion(
            organization_id=uuid.UUID(organization_id),
            document_id=existing.id,
            chatbot_id=uuid.UUID(chatbot_id),
            version_number=next_version_number,
            file_name=file_name,
            file_size_bytes=int(item.get("raw_file_size_bytes") or len(extracted_text.encode("utf-8"))),
            storage_key="",
            mime_type=mime_type,
            source_type="file",
            corpus_domain="official_website_indexed",
            issuing_department=web_metadata.get("department"),
            status="queued",
        )
        db.add(version)
        db.flush()
        _ingest_document_version_content(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            document=existing,
            version=version,
            job=None,
            file_name=file_name,
            file_bytes=extracted_text.encode("utf-8"),
            content_type="text/plain",
            metadata_updates={
                "sourceType": "website_attachment",
                "web_source_id": str(web_source.id),
                "attachment_url": attachment_url,
                "parent_website_url": web_source.base_url,
            },
            rag_settings=rag_settings,
        )


def _guess_file_type_from_url(url: str) -> str:
    path = (urlparse(url).path or "").lower()
    suffix = Path(path).suffix.lower()
    if suffix in ATTACHMENT_FILE_EXTENSIONS or suffix in ATTACHMENT_MIME_HINTS:
        return suffix
    decoded_query = unquote(urlparse(url).query or "").lower()
    for extension in ATTACHMENT_FILE_EXTENSIONS:
        if extension in decoded_query:
            return extension
    return suffix


def _guess_file_name_from_url(url: str) -> str:
    path = urlparse(url).path or ""
    name = Path(path).name
    return name or url


def _guess_mime_type_from_name(name: str | None) -> str:
    suffix = Path(name or "").suffix.lower()
    return ATTACHMENT_MIME_HINTS.get(suffix, "application/octet-stream")


def _is_attachment_url(url: str) -> bool:
    return _guess_file_type_from_url(url) in ATTACHMENT_FILE_EXTENSIONS


def _is_crawl_excluded_file_url(url: str) -> bool:
    return _guess_file_type_from_url(url) in CRAWL_EXCLUDED_FILE_EXTENSIONS


def _add_attachment_url(
    url: str,
    *,
    include_attachments: bool,
    attachment_urls: list[str],
    attachment_seen: set[str],
) -> bool:
    if not include_attachments or not _is_attachment_url(url):
        return False
    if url in attachment_seen or len(attachment_urls) >= MAX_ATTACHMENT_URLS_PER_CRAWL:
        return True
    attachment_seen.add(url)
    attachment_urls.append(url)
    logger.info("[CRAWL_ATTACHMENT] url=%s count=%s", url, len(attachment_urls))
    return True


def _strip_binary_noise(value: str) -> str:
    normalized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]+", " ", value)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _collect_xml_text(raw_bytes: bytes) -> str:
    try:
        root = ET.fromstring(raw_bytes)
    except ET.ParseError:
        return ""
    parts: list[str] = []
    for element in root.iter():
        text = _strip_binary_noise(element.text or "")
        if text:
            parts.append(text)
    return "\n".join(parts).strip()


def _extract_docx_text(file_bytes: bytes) -> str:
    try:
        with ZipFile(BytesIO(file_bytes)) as archive:
            parts: list[str] = []
            for name in archive.namelist():
                if not name.startswith("word/") or not name.endswith(".xml"):
                    continue
                text = _collect_xml_text(archive.read(name))
                if text:
                    parts.append(text)
            return "\n".join(parts).strip()
    except BadZipFile:
        return ""


def _extract_xlsx_text(file_bytes: bytes) -> str:
    try:
        with ZipFile(BytesIO(file_bytes)) as archive:
            parts: list[str] = []
            for name in archive.namelist():
                if not name.startswith("xl/") or not name.endswith(".xml"):
                    continue
                text = _collect_xml_text(archive.read(name))
                if text:
                    parts.append(text)
            return "\n".join(parts).strip()
    except BadZipFile:
        return ""


def _extract_pptx_text(file_bytes: bytes) -> str:
    try:
        with ZipFile(BytesIO(file_bytes)) as archive:
            parts: list[str] = []
            for name in archive.namelist():
                if not name.startswith("ppt/") or not name.endswith(".xml"):
                    continue
                text = _collect_xml_text(archive.read(name))
                if text:
                    parts.append(text)
            return "\n".join(parts).strip()
    except BadZipFile:
        return ""


def _extract_hwpx_text(file_bytes: bytes) -> str:
    try:
        with ZipFile(BytesIO(file_bytes)) as archive:
            parts: list[str] = []
            for name in archive.namelist():
                if not name.endswith(".xml"):
                    continue
                text = _collect_xml_text(archive.read(name))
                if text:
                    parts.append(text)
            return "\n".join(parts).strip()
    except BadZipFile:
        return ""


def _normalize_text_blocks(parts: list[str]) -> str:
    normalized_parts: list[str] = []
    seen: set[str] = set()
    for part in parts:
        cleaned = _strip_binary_noise(part)
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        normalized_parts.append(cleaned)
    return "\n".join(normalized_parts).strip()


def _pdf_text_quality_metrics(text: str) -> tuple[float, int]:
    cleaned = _strip_binary_noise(text)
    if not cleaned:
        return 0.0, 0
    allowed_count = len(PDF_TEXT_ALLOWED_CHAR_REGEX.findall(cleaned))
    total_count = len(cleaned)
    word_count = len([token for token in cleaned.split() if token])
    return (allowed_count / max(total_count, 1)), word_count


def _is_viable_pdf_text(text: str) -> bool:
    cleaned = _strip_binary_noise(text)
    if len(cleaned) < PDF_TEXT_SUFFICIENT_LENGTH:
        return False
    letter_ratio, word_count = _pdf_text_quality_metrics(cleaned)
    return letter_ratio >= PDF_TEXT_MIN_LETTER_RATIO and word_count >= PDF_TEXT_MIN_WORDS


def _looks_like_mojibake_text(text: str) -> bool:
    cleaned = _strip_binary_noise(text)
    if not cleaned:
        return False
    marker_count = len(MOJIBAKE_MARKER_REGEX.findall(cleaned))
    if "�" in cleaned:
        return True
    marker_ratio = marker_count / max(len(cleaned), 1)
    korean_count = len(KOREAN_TEXT_REGEX.findall(cleaned))
    if marker_ratio >= 0.015 and korean_count < max(20, len(cleaned) * 0.08):
        return True
    if marker_count >= 20 and korean_count < marker_count:
        return True
    return False


def _extract_pdf_text_via_pypdf(file_bytes: bytes) -> str:
    parts: list[str] = []
    import pypdf  # type: ignore

    reader = pypdf.PdfReader(BytesIO(file_bytes))
    for page in reader.pages:
        text = _strip_binary_noise(page.extract_text() or "")
        if text:
            parts.append(text)
    return _normalize_text_blocks(parts)


def _extract_pdf_text_via_streams(file_bytes: bytes) -> str:
    parts: list[str] = []

    def append_strings(payload: bytes) -> None:
        for match in re.findall(rb"\(([^()]*)\)", payload):
            try:
                decoded = match.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    decoded = match.decode("utf-16le")
                except UnicodeDecodeError:
                    decoded = match.decode("latin1", errors="ignore")
            cleaned = _strip_binary_noise(decoded)
            if len(cleaned) >= 2:
                parts.append(cleaned)

    append_strings(file_bytes)
    for stream_match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", file_bytes, re.DOTALL):
        payload = stream_match.group(1)
        append_strings(payload)
        try:
            inflated = zlib.decompress(payload)
            append_strings(inflated)
        except Exception:  # noqa: BLE001
            continue
    return _normalize_text_blocks(parts)


def _extract_pdf_text_via_ocr(file_bytes: bytes) -> str:
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_bytes  # type: ignore
        from PIL import ImageOps  # type: ignore
    except Exception:  # noqa: BLE001
        return ""

    try:
        images = convert_from_bytes(
            file_bytes,
            dpi=PDF_OCR_DPI,
            fmt="png",
            thread_count=1,
        )
    except Exception:  # noqa: BLE001
        return ""

    parts: list[str] = []
    for image in images:
        prepared = ImageOps.autocontrast(ImageOps.grayscale(image))
        binary = prepared.point(lambda value: 255 if value > 170 else 0)
        recognized = ""
        for lang in ("kor+eng", "eng"):
            try:
                recognized = pytesseract.image_to_string(binary, lang=lang)
            except Exception:  # noqa: BLE001
                continue
            if _strip_binary_noise(recognized):
                break
        cleaned = _strip_binary_noise(recognized)
        if cleaned:
            parts.append(cleaned)

    return _normalize_text_blocks(parts)


def _extract_pdf_text_via_vision(
    file_bytes: bytes,
    db,
    *,
    max_pages: int = 20,
) -> str:
    """
    PDF를 페이지별 이미지로 변환 후 LLM Vision으로 텍스트 추출.
    표/다단 레이아웃/스캔 문서에 효과적.
    """
    import base64
    import io as _io
    import json as _json
    import urllib.request as _urllib_req

    try:
        from pdf2image import convert_from_bytes  # type: ignore
    except ImportError:
        logger.warning("pdf2image not available for vision extraction")
        return ""

    try:
        images = convert_from_bytes(
            file_bytes,
            dpi=150,
            fmt="png",
            first_page=1,
            last_page=max_pages,
            thread_count=1,
        )
    except Exception as e:
        logger.warning(f"pdf2image conversion failed for vision: {e}")
        return ""

    from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

    api_cfg = resolve_runtime_api_config(db)
    if api_cfg is None:
        logger.warning("No API config available for vision extraction")
        return ""

    provider = (api_cfg.provider or "").lower()
    api_key = api_cfg.api_key or ""
    base_url = (api_cfg.base_url or "").rstrip("/")

    if not api_key:
        logger.warning("No API key for vision extraction")
        return ""

    VISION_PROMPT = (
        "이 문서 페이지의 모든 텍스트를 추출해주세요.\n"
        "표는 행과 열 구조를 유지해서 텍스트로 변환하세요.\n"
        "머리글/바닥글/페이지 번호는 제외하세요.\n"
        "추출된 텍스트만 출력하고 다른 설명은 하지 마세요."
    )

    extracted_pages: list[str] = []

    for i, img in enumerate(images):
        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode()

        try:
            if provider in ("openai", "azure_openai", "azure"):
                if provider in ("azure_openai", "azure"):
                    endpoint = f"{base_url}/chat/completions"
                else:
                    endpoint = "https://api.openai.com/v1/chat/completions"

                payload = {
                    "model": "gpt-4o-mini",
                    "max_tokens": 2000,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{img_b64}",
                                        "detail": "high",
                                    },
                                },
                                {"type": "text", "text": VISION_PROMPT},
                            ],
                        }
                    ],
                }
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                }
                req = _urllib_req.Request(
                    endpoint,
                    data=_json.dumps(payload).encode(),
                    headers=headers,
                    method="POST",
                )
                with _urllib_req.urlopen(req, timeout=60) as resp:
                    result = _json.loads(resp.read())
                page_text = (
                    result.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )

            elif provider == "anthropic":
                payload = {
                    "model": "claude-3-5-haiku-20241022",
                    "max_tokens": 2000,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": img_b64,
                                    },
                                },
                                {"type": "text", "text": VISION_PROMPT},
                            ],
                        }
                    ],
                }
                headers = {
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                }
                req = _urllib_req.Request(
                    "https://api.anthropic.com/v1/messages",
                    data=_json.dumps(payload).encode(),
                    headers=headers,
                    method="POST",
                )
                with _urllib_req.urlopen(req, timeout=60) as resp:
                    result = _json.loads(resp.read())
                page_text = (
                    result.get("content", [{}])[0]
                    .get("text", "")
                    .strip()
                )

            else:
                logger.warning(f"Vision not supported for provider: {provider}")
                break

            if page_text:
                extracted_pages.append(f"[페이지 {i + 1}]\n{page_text}")

        except Exception as e:
            logger.warning(f"Vision extraction failed page {i + 1}: {e}")
            continue

    return "\n\n".join(extracted_pages)


def _extract_pdf_text_best_effort(
    file_bytes: bytes,
    *,
    use_vision: bool = False,
    db=None,
) -> tuple[str, str]:
    if use_vision and db is not None:
        vision_text = _extract_pdf_text_via_vision(file_bytes, db)
        if vision_text and len(vision_text.strip()) > 50:
            return vision_text, "vision"

    try:
        extracted = _extract_pdf_text_via_pypdf(file_bytes)
        if _is_viable_pdf_text(extracted):
            return extracted, "text"
    except Exception:  # noqa: BLE001
        extracted = ""

    stream_text = _extract_pdf_text_via_streams(file_bytes)
    combined = _normalize_text_blocks([extracted, stream_text])
    if _is_viable_pdf_text(combined):
        return combined, "text"

    ocr_text = _extract_pdf_text_via_ocr(file_bytes)
    if _is_viable_pdf_text(ocr_text):
        return _normalize_text_blocks([ocr_text]), "ocr"

    return "", "failed"


def _extract_hwp_text_best_effort(file_bytes: bytes) -> str:
    parts: list[str] = []
    for encoding in ("utf-16le", "utf-8", "cp949", "latin1"):
        try:
            decoded = file_bytes.decode(encoding, errors="ignore")
        except Exception:  # noqa: BLE001
            continue
        matches = re.findall(r"[가-힣A-Za-z0-9][가-힣A-Za-z0-9\s\-\.,:/()]{8,}", decoded)
        for match in matches:
            cleaned = _strip_binary_noise(match)
            if len(cleaned) >= 8:
                parts.append(cleaned)
        if parts:
            break
    return "\n".join(parts).strip()


def _extract_attachment_text(file_url: str, file_bytes: bytes, content_type: str | None) -> tuple[str, str, str]:
    file_type = _guess_file_type_from_url(file_url)
    if file_type == ".pdf":
        extracted_text, extraction_method = _extract_pdf_text_best_effort(file_bytes)
        return extracted_text, file_type, extraction_method
    if file_type == ".docx":
        return _extract_docx_text(file_bytes), file_type, "text"
    if file_type == ".xlsx":
        return _extract_xlsx_text(file_bytes), file_type, "text"
    if file_type == ".pptx":
        return _extract_pptx_text(file_bytes), file_type, "text"
    if file_type == ".hwpx":
        return _extract_hwpx_text(file_bytes), file_type, "text"
    if file_type == ".hwp":
        return _extract_hwp_text_best_effort(file_bytes), file_type, "text"
    if content_type and content_type.startswith(TEXTISH_MIME_PREFIXES):
        return _strip_binary_noise(file_bytes.decode("utf-8", errors="ignore")), file_type, "text"
    return "", file_type, "failed"


def _extract_document_text(
    file_name: str,
    file_bytes: bytes,
    content_type: str | None,
    use_vision: bool = False,
    db=None,
) -> tuple[str, str, str]:
    file_type = Path(file_name or "upload.bin").suffix.lower()
    normalized_content_type = content_type or ATTACHMENT_MIME_HINTS.get(file_type)
    if file_type in {".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm"}:
        return file_bytes.decode("utf-8", errors="ignore").strip(), file_type, "text"
    if normalized_content_type and normalized_content_type.startswith(TEXTISH_MIME_PREFIXES):
        return file_bytes.decode("utf-8", errors="ignore").strip(), file_type, "text"
    if file_type == ".pdf":
        extracted_text, extraction_method = _extract_pdf_text_best_effort(
            file_bytes,
            use_vision=use_vision,
            db=db,
        )
        return extracted_text, file_type, extraction_method
    synthetic_url = f"https://local-upload.invalid/{file_name}"
    return _extract_attachment_text(synthetic_url, file_bytes, normalized_content_type)


def _canonicalize_website_url(url: str) -> str:
    normalized, _fragment = urldefrag(url.strip())
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_WEBSITE_URL")

    hostname = (parsed.hostname or "").lower()
    port = parsed.port
    if port and not ((parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443)):
        netloc = f"{hostname}:{port}"
    else:
        netloc = hostname

    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/") or "/"

    return parsed._replace(scheme=parsed.scheme.lower(), netloc=netloc, path=path, fragment="").geturl()


def _normalize_excluded_paths(paths: list[str] | None) -> list[str]:
    seen: set[str] = set()
    normalized_paths: list[str] = []
    for value in paths or []:
        candidate = str(value).strip()
        if not candidate:
            continue
        if not candidate.startswith("/"):
            candidate = f"/{candidate}"
        candidate = candidate.rstrip("/") or "/"
        if candidate not in seen:
            seen.add(candidate)
            normalized_paths.append(candidate)
    return normalized_paths


def _resolve_crawl_page_limit(metadata: dict | None) -> int:
    metadata_dict = metadata or {}
    raw_value = metadata_dict.get("crawl_page_limit")
    crawl_all_pages = _resolve_crawl_all_pages(metadata_dict)
    try:
        default_limit = (
            DEFAULT_FULL_SITE_CRAWL_PAGE_LIMIT
            if crawl_all_pages
            else DEFAULT_CRAWL_PAGE_LIMIT
        )
        value = int(raw_value or default_limit)
        if crawl_all_pages and "crawl_all_pages" not in metadata_dict and value == DEFAULT_CRAWL_PAGE_LIMIT:
            value = DEFAULT_FULL_SITE_CRAWL_PAGE_LIMIT
    except (TypeError, ValueError):
        value = DEFAULT_FULL_SITE_CRAWL_PAGE_LIMIT if crawl_all_pages else DEFAULT_CRAWL_PAGE_LIMIT
    return max(1, min(value, MAX_CRAWL_PAGE_LIMIT))


def _resolve_crawl_all_pages(metadata: dict | None) -> bool:
    value = (metadata or {}).get("crawl_all_pages")
    if value is None:
        return True
    return bool(value)


def _resolve_include_attachments(metadata: dict | None) -> bool:
    value = (metadata or {}).get("include_attachments")
    if value is None:
        return True
    return bool(value)


def _normalize_crawl_url(base_url: str, href: str) -> str | None:
    raw_href = str(href or "").strip()
    if not raw_href or raw_href.startswith(("javascript:", "mailto:", "tel:")):
        return None
    absolute = urljoin(base_url, raw_href)
    absolute, _fragment = urldefrag(absolute)
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    safe_path = quote(unquote(parsed.path or "/"), safe="/:@!$&'()*+,;=%")
    safe_query = quote(unquote(parsed.query or ""), safe="=&?/:@!$'()*+,;,%")
    parsed = parsed._replace(path=safe_path, query=safe_query, fragment="")
    absolute = parsed.geturl()
    lowered_path = parsed.path.lower()
    if any(lowered_path.endswith(ext) for ext in SKIP_FILE_EXTENSIONS):
        return None
    if _is_crawl_excluded_file_url(absolute):
        return absolute
    return absolute


def _same_domain(url: str, hostname: str) -> bool:
    parsed = urlparse(url)
    target = (parsed.hostname or "").lower()
    root = hostname.lower()
    return bool(target) and (target == root or target.endswith(f".{root}"))


def _collect_sitemap_urls(base_url: str, hostname: str, *, limit: int) -> list[str]:
    parsed = urlparse(base_url)
    sitemap_url = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
    try:
        payload, _content_type = _fetch_binary_resource(sitemap_url)
    except Exception:  # noqa: BLE001
        return []

    try:
        root = ET.fromstring(payload)
    except ET.ParseError:
        return []

    urls: list[str] = []
    seen: set[str] = set()
    for element in root.iter():
        if not element.tag.lower().endswith("loc") or not element.text:
            continue
        normalized = _normalize_crawl_url(base_url, element.text.strip())
        if not normalized or normalized in seen or not _same_domain(normalized, hostname):
            continue
        if _is_attachment_url(normalized):
            continue
        seen.add(normalized)
        urls.append(normalized)
        if len(urls) >= limit:
            break
    return urls


def _crawl_website(
    base_url: str,
    *,
    crawl_depth: int,
    max_pages: int,
    excluded_paths: list[str] | None,
    crawl_all_pages: bool,
    include_attachments: bool,
    delay_min: float = CRAWL_DELAY_MIN,
    delay_max: float = CRAWL_DELAY_MAX,
    max_consecutive_failures: int = MAX_CONSECUTIVE_CRAWL_FAILURES,
    progress_callback: Callable[[int, int], None] | None = None,
) -> tuple[str, str, list[str], list[str], str | None, int | None, dict[str, int | str | bool | None]]:
    parsed_root = urlparse(base_url)
    root_hostname = parsed_root.hostname or ""
    normalized_excluded = _normalize_excluded_paths(excluded_paths)
    sitemap_urls = _collect_sitemap_urls(base_url, root_hostname, limit=max_pages) if root_hostname else []
    queue: list[tuple[str, int]] = [(base_url, 0), *((url, 1) for url in sitemap_urls if url != base_url)]
    queued: set[str] = {url for url, _depth in queue}
    visited: set[str] = set()
    crawled_urls: list[str] = []
    attachment_urls: list[str] = []
    attachment_seen: set[str] = set()
    text_blocks: list[str] = []
    html_blocks: list[str] = []
    first_final_url: str | None = None
    first_http_status_code: int | None = None
    total_removed_navigation_lines = 0
    first_extraction_method: str | None = None
    navigation_removed = False
    crawl_errors: list[str] = []
    consecutive_failures = 0

    max_depth = FULL_SITE_CRAWL_DEPTH if crawl_all_pages else max(0, crawl_depth)
    page_limit = max(1, min(max_pages, MAX_CRAWL_PAGE_LIMIT))

    def emit_progress() -> None:
        if progress_callback is not None:
            progress_callback(len(crawled_urls), page_limit)

    while queue and len(crawled_urls) < page_limit:
        current_url, depth = queue.pop(0)
        queued.discard(current_url)
        if current_url in visited:
            continue
        visited.add(current_url)
        if _is_crawl_excluded_file_url(current_url):
            _add_attachment_url(
                current_url,
                include_attachments=include_attachments,
                attachment_urls=attachment_urls,
                attachment_seen=attachment_seen,
            )
            logger.info("[CRAWL_SKIP] url=%s reason=attachment_or_invalid_url", current_url)
            continue
        if not _same_domain(current_url, root_hostname):
            continue
        current_path = urlparse(current_url).path or "/"
        if any(current_path.startswith(path) for path in normalized_excluded):
            continue

        time.sleep(random.uniform(delay_min, delay_max))
        try:
            (
                html,
                text,
                links,
                final_url,
                http_status_code,
                page_title,
                extraction_method,
                page_navigation_removed,
                removed_navigation_lines,
            ) = _fetch_website_page(current_url)
        except _WebsiteFetchSkipped as exc:
            consecutive_failures += 1
            crawl_errors.append(f"{current_url}: {exc.reason}")
            logger.warning(
                "[CRAWL_SKIP] url=%s status=%s reason=%s consecutive_failures=%s",
                current_url,
                exc.status_code or "",
                exc.reason,
                consecutive_failures,
            )
            if consecutive_failures >= max_consecutive_failures:
                logger.warning(
                    "[CRAWL_STOP] reason=consecutive_failures count=%s page_limit=%s",
                    consecutive_failures,
                    page_limit,
                )
                break
            emit_progress()
            continue
        except Exception as exc:  # noqa: BLE001
            consecutive_failures += 1
            crawl_errors.append(f"{current_url}: {exc}")
            logger.warning(
                "[CRAWL_ERROR] url=%s error=%s consecutive_failures=%s",
                current_url,
                exc,
                consecutive_failures,
            )
            if consecutive_failures >= max_consecutive_failures:
                logger.warning(
                    "[CRAWL_STOP] reason=consecutive_failures count=%s page_limit=%s",
                    consecutive_failures,
                    page_limit,
                )
                break
            emit_progress()
            continue
        consecutive_failures = 0
        if first_final_url is None:
            first_final_url = final_url
        if first_http_status_code is None:
            first_http_status_code = http_status_code
        if first_extraction_method is None:
            first_extraction_method = extraction_method
        navigation_removed = navigation_removed or page_navigation_removed
        total_removed_navigation_lines += removed_navigation_lines
        crawled_urls.append(final_url or current_url)
        html_blocks.append(html)
        if text:
            text_blocks.append(
                "\n".join(
                    [
                        f"[URL] {current_url}",
                        f"[FINAL_URL] {final_url or current_url}",
                        f"[TITLE] {page_title or ''}",
                        f"[EXTRACTION_METHOD] {extraction_method}",
                        f"[NAVIGATION_REMOVED] {str(page_navigation_removed).lower()}",
                        text,
                    ]
                ).strip()
            )
        if len(crawled_urls) % 10 == 0:
            logger.info("크롤링 진행: %s/%s 페이지", len(crawled_urls), page_limit)
        emit_progress()
        logger.info(
            "[WEB_CRAWL] url=%s status=%s extracted_text_length=%s chunk_count_before_filter=%s "
            "chunk_count_after_filter=%s removed_navigation_lines=%s extraction_method=%s",
            final_url or current_url,
            http_status_code or "",
            len(text),
            len(_split_text_chunks(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)),
            len(
                [
                    chunk
                    for chunk in _split_text_chunks(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
                    if not _is_low_quality_chunk(str(chunk.get("text") or ""))
                ]
            ),
            removed_navigation_lines,
            extraction_method,
        )

        if depth >= max_depth:
            continue

        for href in links:
            normalized = _normalize_crawl_url(current_url, href)
            if not normalized or normalized in visited or normalized in queued:
                if href and not normalized:
                    logger.info("[CRAWL_SKIP] url=%s reason=attachment_or_invalid_url", href)
                continue
            if not _same_domain(normalized, root_hostname):
                continue
            normalized_path = urlparse(normalized).path or "/"
            if any(normalized_path.startswith(path) for path in normalized_excluded):
                continue
            if _is_crawl_excluded_file_url(normalized):
                _add_attachment_url(
                    normalized,
                    include_attachments=include_attachments,
                    attachment_urls=attachment_urls,
                    attachment_seen=attachment_seen,
                )
                logger.info("[CRAWL_SKIP] url=%s reason=attachment_or_invalid_url", normalized)
                continue
            queue.append((normalized, depth + 1))
            queued.add(normalized)

    return (
        "\n\n".join(html_blocks),
        "\n\n".join(text_blocks).strip(),
        crawled_urls,
        attachment_urls,
        first_final_url,
        first_http_status_code,
        {
            "removed_navigation_lines": total_removed_navigation_lines,
            "extraction_method": first_extraction_method,
            "navigation_removed": navigation_removed,
            "crawl_error_count": len(crawl_errors),
            "crawl_errors": "; ".join(crawl_errors[:10]),
        },
    )


def _find_web_source_document(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    web_source_id: str,
) -> Document | None:
    stmt = select(Document).where(
        Document.organization_id == uuid.UUID(organization_id),
        Document.chatbot_id == uuid.UUID(chatbot_id),
        Document.deleted_at.is_(None),
        Document.metadata_json["sourceType"].astext == "website",
        Document.metadata_json["web_source_id"].astext == web_source_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def _list_web_source_attachment_documents(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    web_source_id: str,
) -> list[Document]:
    stmt = select(Document).where(
        Document.organization_id == uuid.UUID(organization_id),
        Document.chatbot_id == uuid.UUID(chatbot_id),
        Document.deleted_at.is_(None),
        Document.metadata_json["sourceType"].astext == "website_attachment",
        Document.metadata_json["web_source_id"].astext == web_source_id,
    )
    return list(db.execute(stmt).scalars().all())


def _set_job_failed(
    *,
    web_source: WebSource,
    job: IngestionJob,
    error_code: str,
    error_message: str,
) -> None:
    now = datetime.now(UTC)
    web_source.status = "failed"
    web_source.last_synced_at = now
    web_source.last_error_code = error_code
    web_source.last_error_message = error_message
    job.status = "failed"
    job.current_step = "failed"
    job.progress_percent = 100
    job.error_code = error_code
    job.error_message = error_message
    job.finished_at = now
    _log_ingest_status(
        knowledge_id=web_source.id,
        source_type="website",
        old_status=None,
        new_status="failed",
        chunk_count=web_source.chunk_count or 0,
        embedding_count=web_source.embedding_count or 0,
        reason=error_code,
    )
    _log_knowledge_diag(
        item_id=web_source.id,
        source_type="website",
        status=web_source.status,
        text_length=web_source.extracted_text_length or 0,
        chunk_count=web_source.chunk_count or 0,
        embedding_count=web_source.embedding_count or 0,
        error=error_message,
    )


def _collect_attachment_contents(
    attachment_urls: list[str],
    *,
    progress_callback: Callable[[int, int], None] | None = None,
) -> tuple[list[dict[str, object]], list[str]]:
    attachment_items: list[dict[str, object]] = []
    attachment_text_blocks: list[str] = []

    total = len(attachment_urls)
    for index, url in enumerate(attachment_urls, start=1):
        file_name = _guess_file_name_from_url(url)
        file_type = _guess_file_type_from_url(url)
        mime_type = ATTACHMENT_MIME_HINTS.get(file_type)
        try:
            payload, detected_content_type = _fetch_binary_resource(url)
            if detected_content_type:
                mime_type = detected_content_type
            extracted_text, detected_file_type, extraction_method = _extract_attachment_text(url, payload, mime_type)
            if detected_file_type:
                file_type = detected_file_type
            extracted = bool(extracted_text.strip())
            status = (
                "completed"
                if extracted
                else "unsupported"
                if file_type in UNSUPPORTED_ATTACHMENT_FILE_TYPES
                else "empty"
            )
            if extracted:
                attachment_text_blocks.append(f"[ATTACHMENT] {file_name}\n[URL] {url}\n{extracted_text.strip()}")
            attachment_items.append(
                {
                    "url": url,
                    "file_name": file_name,
                    "file_type": file_type,
                    "mime_type": mime_type,
                    "text_length": len(extracted_text.strip()),
                    "extracted": extracted,
                    "extraction_method": extraction_method,
                    "extraction_status": status,
                    "error_message": None,
                    "extracted_text": extracted_text.strip(),
                    "raw_file_size_bytes": len(payload),
                }
            )
        except HTTPError as exc:
            attachment_items.append(
                {
                    "url": url,
                    "file_name": file_name,
                    "file_type": file_type,
                    "mime_type": mime_type,
                    "text_length": 0,
                    "extracted": False,
                    "extraction_method": "failed",
                    "extraction_status": "failed",
                    "error_message": f"HTTP_{exc.code}",
                    "extracted_text": "",
                    "raw_file_size_bytes": 0,
                }
            )
        except Exception as exc:  # noqa: BLE001
            attachment_items.append(
                {
                    "url": url,
                    "file_name": file_name,
                    "file_type": file_type,
                    "mime_type": mime_type,
                    "text_length": 0,
                    "extracted": False,
                    "extraction_method": "failed",
                    "extraction_status": "failed",
                    "error_message": str(exc),
                    "extracted_text": "",
                    "raw_file_size_bytes": 0,
                }
            )
        if progress_callback is not None:
            progress_callback(index, total)

    return attachment_items, attachment_text_blocks


def _ingest_web_source_content(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    web_source: WebSource,
    job: IngestionJob,
    rag_settings: dict | None = None,
) -> None:
    now = datetime.now(UTC)
    old_web_status = web_source.status
    job.status = "processing"
    job.current_step = "fetching"
    job.progress_percent = 10
    job.started_at = now
    job.attempt_count = (job.attempt_count or 0) + 1
    db.flush()

    try:
        crawl_page_limit = _resolve_crawl_page_limit(web_source.metadata_json)
        crawl_all_pages = _resolve_crawl_all_pages(web_source.metadata_json)
        include_attachments = _resolve_include_attachments(web_source.metadata_json)
        _delay_min = float((rag_settings or {}).get("crawlDelayMin", CRAWL_DELAY_MIN))
        _delay_max = float((rag_settings or {}).get("crawlDelayMax", CRAWL_DELAY_MAX))
        _max_failures = int(
            (rag_settings or {}).get(
                "crawlMaxConsecutiveFailures",
                MAX_CONSECUTIVE_CRAWL_FAILURES,
            )
        )

        def crawl_progress(done: int, total: int) -> None:
            job.current_step = "fetching"
            job.progress_percent = min(34, 10 + int((done / max(total, 1)) * 24))
            db.flush()

        (
            html,
            extracted_text,
            crawled_urls,
            attachment_urls,
            final_url,
            http_status_code,
            crawl_diagnostics,
        ) = _crawl_website(
            web_source.base_url,
            crawl_depth=web_source.crawl_depth,
            max_pages=crawl_page_limit,
            excluded_paths=list(web_source.excluded_paths or []),
            crawl_all_pages=crawl_all_pages,
            include_attachments=include_attachments,
            delay_min=_delay_min,
            delay_max=_delay_max,
            max_consecutive_failures=_max_failures,
            progress_callback=crawl_progress,
        )
    except HTTPError as exc:
        _set_job_failed(
            web_source=web_source,
            job=job,
            error_code=f"HTTP_{exc.code}",
            error_message=f"웹사이트 응답 오류: HTTP {exc.code}",
        )
        return
    except URLError as exc:
        _set_job_failed(
            web_source=web_source,
            job=job,
            error_code="URL_FETCH_FAILED",
            error_message=f"웹사이트 연결 실패: {exc.reason}",
        )
        return
    except Exception as exc:  # noqa: BLE001
        _set_job_failed(
            web_source=web_source,
            job=job,
            error_code="WEBSITE_FETCH_FAILED",
            error_message=str(exc),
        )
        return

    job.current_step = "fetching_attachments"
    job.progress_percent = 35
    db.flush()

    def attachment_progress(done: int, total: int) -> None:
        job.current_step = "fetching_attachments"
        job.progress_percent = min(50, 35 + int((done / max(total, 1)) * 15))
        db.flush()

    attachment_files, attachment_text_blocks = (
        _collect_attachment_contents(attachment_urls, progress_callback=attachment_progress)
        if include_attachments
        else ([], [])
    )
    extracted_attachment_files = [
        item for item in attachment_files if str(item.get("extracted_text") or "").strip()
    ]
    if extracted_attachment_files:
        try:
            with db.begin_nested():
                _sync_web_source_attachment_documents(
                    db,
                    organization_id=organization_id,
                    chatbot_id=chatbot_id,
                    web_source=web_source,
                    web_metadata=dict(web_source.metadata_json or {}),
                    attachment_items=extracted_attachment_files,
                    rag_settings=rag_settings,
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "[WEB_ATTACHMENT_SYNC_FAILED] web_source_id=%s attachment_count=%s error=%s",
                web_source.id,
                len(extracted_attachment_files),
                exc,
            )
            for item in attachment_files:
                if not str(item.get("error_message") or "").strip():
                    item["extraction_status"] = "sync_failed"
                    item["error_message"] = f"ATTACHMENT_SYNC_FAILED: {exc}"
    attachment_files = _serialize_attachment_items(attachment_files)
    combined_text = extracted_text.strip()
    if attachment_text_blocks:
        combined_text = "\n\n".join([combined_text, *attachment_text_blocks]).strip()

    if not combined_text.strip():
        _set_job_failed(
            web_source=web_source,
            job=job,
            error_code="EMPTY_WEBSITE_CONTENT",
            error_message="웹사이트 본문과 첨부파일 텍스트를 추출하지 못했습니다.",
        )
        return

    job.current_step = "chunking"
    job.progress_percent = 55
    db.flush()

    web_metadata = dict(web_source.metadata_json or {})
    content_hash = sha256(combined_text.encode("utf-8")).hexdigest()
    document = _find_web_source_document(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        web_source_id=str(web_source.id),
    )

    if document is None:
        document = Document(
            organization_id=uuid.UUID(organization_id),
            chatbot_id=uuid.UUID(chatbot_id),
            title=web_source.name,
            category=web_metadata.get("category"),
            corpus_domain="official_website_indexed",
            description=_truncate_preview(combined_text, 220),
            status="active",
            uploaded_at=now,
            metadata_json={
                "sourceType": "website",
                "web_source_id": str(web_source.id),
                "url": web_source.base_url,
                "field": web_metadata.get("field"),
                "tags": _parse_tags(web_metadata.get("tags")),
                "memo": web_metadata.get("memo"),
                "department": web_metadata.get("department"),
                "summary": _truncate_preview(combined_text, 220) or web_source.base_url,
                "sensitive_detected": _detect_sensitive(combined_text),
                "crawled_urls": crawled_urls,
                "crawl_page_limit": crawl_page_limit,
                "crawl_all_pages": crawl_all_pages,
                "include_attachments": include_attachments,
                "attachment_files": attachment_files,
                "attachment_file_count": len(attachment_files),
                "extraction_method": crawl_diagnostics.get("extraction_method"),
                "navigation_removed": crawl_diagnostics.get("navigation_removed"),
                "removed_navigation_lines": crawl_diagnostics.get("removed_navigation_lines"),
                "crawl_error_count": crawl_diagnostics.get("crawl_error_count"),
                "crawl_errors": crawl_diagnostics.get("crawl_errors"),
            },
        )
        db.add(document)
        db.flush()
    else:
        document.title = web_source.name
        document.category = web_metadata.get("category")
        document.corpus_domain = "official_website_indexed"
        document.description = _truncate_preview(combined_text, 220)
        document.status = "active"
        document.processed_at = now
        document.metadata_json = {
            **dict(document.metadata_json or {}),
            "sourceType": "website",
            "web_source_id": str(web_source.id),
            "url": web_source.base_url,
            "field": web_metadata.get("field"),
            "tags": _parse_tags(web_metadata.get("tags")),
            "memo": web_metadata.get("memo"),
            "department": web_metadata.get("department"),
            "summary": _truncate_preview(combined_text, 220) or web_source.base_url,
            "sensitive_detected": _detect_sensitive(combined_text),
            "crawled_urls": crawled_urls,
            "crawl_page_limit": crawl_page_limit,
            "crawl_all_pages": crawl_all_pages,
            "include_attachments": include_attachments,
            "attachment_files": attachment_files,
            "attachment_file_count": len(attachment_files),
            "extraction_method": crawl_diagnostics.get("extraction_method"),
            "navigation_removed": crawl_diagnostics.get("navigation_removed"),
            "removed_navigation_lines": crawl_diagnostics.get("removed_navigation_lines"),
            "crawl_error_count": crawl_diagnostics.get("crawl_error_count"),
            "crawl_errors": crawl_diagnostics.get("crawl_errors"),
        }
        db.flush()

    next_version_number = max((version.version_number for version in document.versions), default=0) + 1
    storage_name = f"{uuid.uuid4()}.html.txt"
    storage_path = KNOWLEDGE_STORAGE_DIR / storage_name
    KNOWLEDGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    storage_path.write_text(combined_text, encoding="utf-8")

    version = DocumentVersion(
        organization_id=uuid.UUID(organization_id),
        document_id=document.id,
        chatbot_id=uuid.UUID(chatbot_id),
        version_number=next_version_number,
        file_name=f"{web_source.name}.html",
        file_size_bytes=len(html.encode("utf-8")),
        storage_key=str(storage_path),
        mime_type="text/html",
        source_type="website",
        corpus_domain="official_website_indexed",
        is_active=False,
        issuing_department=web_metadata.get("department"),
        status="processing",
        checksum_sha256=content_hash,
    )
    db.add(version)
    db.flush()

    _chunk_size = int((rag_settings or {}).get("chunkSize", CHUNK_SIZE))
    chunks = _split_website_chunks(
        combined_text,
        default_title=web_source.name,
        chunk_size=_chunk_size,
    )
    logger.info("[WEB_CRAWL] text_length=%s chunk_count=%s", len(combined_text), len(chunks))
    web_source.extracted_text_length = len(combined_text)
    web_source.chunk_count = len(chunks)
    web_source.embedding_count = 0
    web_source.final_url = final_url or web_source.base_url
    web_source.http_status_code = http_status_code
    version.extracted_text_length = len(combined_text)
    version.chunk_count = len(chunks)
    version.embedding_count = 0
    if not chunks:
        _set_job_failed(
            web_source=web_source,
            job=job,
            error_code="EMPTY_WEBSITE_CHUNKS",
            error_message="색인 가능한 웹사이트 텍스트가 없습니다.",
        )
        version.status = "failed"
        version.error_code = "EMPTY_WEBSITE_CHUNKS"
        version.processed_at = now
        version.error_message = "색인 가능한 웹사이트 텍스트가 없습니다."
        return

    embedding_count = 0
    embedding_error_counts: dict[str, int] = {}
    embedding_texts = [
        f"{str(chunk_item.get('section_title') or web_source.name)}\n{str(chunk_item['text'] or '')}"
        for chunk_item in chunks
    ]
    embeddings = generate_embeddings_batch(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        texts=embedding_texts,
    )
    for index, chunk_item in enumerate(chunks, start=1):
        chunk_text = str(chunk_item["text"] or "")
        chunk_url = str(chunk_item["url"] or web_source.base_url)
        section_title = str(chunk_item["section_title"] or web_source.name)
        page_title = str(chunk_item.get("page_title") or web_source.name)
        chunk_final_url = str(chunk_item.get("final_url") or chunk_url)
        extraction_method = str(chunk_item.get("extraction_method") or crawl_diagnostics.get("extraction_method") or "")
        navigation_removed = str(
            chunk_item.get("navigation_removed") or crawl_diagnostics.get("navigation_removed") or ""
        )
        embedding = embeddings[index - 1] if index - 1 < len(embeddings) else None
        if _embedding_generated(embedding):
            embedding_count += 1
        else:
            embedding_error_counts["EMBEDDING_BATCH_FAILED"] = (
                embedding_error_counts.get("EMBEDDING_BATCH_FAILED", 0) + 1
            )
        db.add(
            DocumentChunk(
                organization_id=uuid.UUID(organization_id),
                document_id=document.id,
                chatbot_id=uuid.UUID(chatbot_id),
                document_version_id=version.id,
                chunk_order=index,
                page_number=None,
                section_title=section_title,
                corpus_domain="official_website_indexed",
                text_content=chunk_text,
                metadata_json={
                    "sourceType": "website",
                    "web_source_id": str(web_source.id),
                    "url": chunk_url,
                    "page_title": page_title,
                    "final_url": chunk_final_url,
                    "section_title": section_title,
                    "extraction_method": extraction_method or None,
                    "navigation_removed": navigation_removed.lower() == "true",
                },
                embedding=embedding,
                token_count=len(chunk_text.split()),
                content_hash=sha256(chunk_text.encode("utf-8")).hexdigest(),
            )
        )
        try:
            db.flush()
        except SQLAlchemyError as exc:
            logger.exception("[EMBEDDING_ERROR] chunk_id=%s error_code=VECTOR_SAVE_ERROR error=%s", f"{web_source.id}:{index}", exc)
            raise

    version.embedding_count = embedding_count
    web_source.embedding_count = embedding_count
    logger.info(
        "[EMBEDDING] requested=%s success=%s failed=%s",
        len(chunks),
        embedding_count,
        len(chunks) - embedding_count,
    )
    if embedding_count < len(chunks):
        logger.warning(
            "Knowledge embedding count is lower than chunk count: item_id=%s chunk_count=%s embedding_count=%s",
            web_source.id,
            len(chunks),
            embedding_count,
        )
    if embedding_count == 0:
        version.status = "failed"
        version.error_code, version.error_message = _summarize_embedding_error(embedding_error_counts)
        version.is_active = False
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_version_id == version.id))
        web_source.status = "failed"
        web_source.last_error_code = version.error_code
        web_source.last_error_message = version.error_message
    else:
        version.status = "completed"
        version.error_code = None
        version.error_message = None
        version.is_active = True
        for previous_version in document.versions:
            if previous_version.id != version.id:
                previous_version.is_active = False
        db.execute(
            delete(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .where(DocumentChunk.document_version_id != version.id)
        )
        web_source.status = "active"
        web_source.last_error_code = None
        web_source.last_error_message = None
    version.processed_at = now
    if version.status == "completed":
        document.current_version_id = version.id
    document.processed_at = now
    document.status = "active" if version.status == "completed" else document.status
    web_source.last_synced_at = now
    web_source.metadata_json = {
        **web_metadata,
        "summary": _truncate_preview(combined_text, 220) or web_source.base_url,
        "sensitive_detected": _detect_sensitive(combined_text),
        "extracted_text_length": len(combined_text),
        "indexed_chunk_count": len(chunks),
        "embedding_count": embedding_count,
        "error_code": version.error_code,
        "error_message": version.error_message,
        "crawled_urls": crawled_urls,
        "crawled_page_count": len(crawled_urls),
        "final_url": final_url or web_source.base_url,
        "http_status_code": http_status_code,
        "crawl_page_limit": crawl_page_limit,
        "crawl_all_pages": crawl_all_pages,
        "include_attachments": include_attachments,
        "attachment_files": attachment_files,
        "attachment_file_count": len(attachment_files),
        "extraction_method": crawl_diagnostics.get("extraction_method"),
        "navigation_removed": crawl_diagnostics.get("navigation_removed"),
        "removed_navigation_lines": crawl_diagnostics.get("removed_navigation_lines"),
        "crawl_error_count": crawl_diagnostics.get("crawl_error_count"),
        "crawl_errors": crawl_diagnostics.get("crawl_errors"),
    }
    _clear_stale_recovery_metadata(job)
    job.status = version.status
    job.current_step = "failed" if version.status == "failed" else "completed"
    job.progress_percent = 100
    job.error_code = version.error_code
    job.error_message = version.error_message
    job.finished_at = now
    _log_ingest_status(
        knowledge_id=web_source.id,
        source_type="website",
        old_status=old_web_status,
        new_status=version.status,
        chunk_count=web_source.chunk_count or 0,
        embedding_count=web_source.embedding_count or 0,
        reason=version.error_code or "completed",
    )
    _log_knowledge_diag(
        item_id=web_source.id,
        source_type="website",
        status=version.status,
        text_length=web_source.extracted_text_length or 0,
        chunk_count=web_source.chunk_count or 0,
        embedding_count=web_source.embedding_count or 0,
        error=version.error_message,
    )


def _normalize_status(base_status: str | None, *, is_active: bool, ingestion_status: str | None) -> str:
    base = (base_status or "").lower()
    ingestion = (ingestion_status or "").lower()
    if ingestion in {"failed", "error"} or base == "failed":
        return "failed"
    if ingestion in {"queued", "pending"} or base == "queued":
        return "queued"
    if ingestion in {"processing", "running"} or base == "processing":
        return "processing"
    if not is_active or base in {"inactive", "deprecated", "deleted"}:
        return "inactive"
    return "completed"


def _counts_terminal_status(
    *,
    extracted_text_length: int | None,
    chunk_count: int | None,
    embedding_count: int | None,
    base_status: str | None,
    ingestion_status: str | None,
    is_active: bool,
) -> str:
    chunks = int(chunk_count or 0)
    embeddings = int(embedding_count or 0)
    base = (base_status or "").lower()
    ingestion = (ingestion_status or "").lower()
    # explicit failure wins first
    if base == "failed" or ingestion in {"failed", "error"}:
        return "failed"
    # searchable = completed regardless of text_len
    if chunks > 0 and embeddings > 0:
        return "completed"
    if not is_active:
        return "inactive"
    # active job still running (no chunks yet)
    if chunks == 0 and embeddings == 0 and ingestion in {"queued", "pending"}:
        return "queued"
    if chunks == 0 and embeddings == 0 and ingestion in {"processing", "running"}:
        return "processing"
    # chunks exist but no embeddings
    if chunks > 0 and embeddings == 0:
        return "failed"
    return _normalize_status(base_status, is_active=is_active, ingestion_status=ingestion_status)


def _compute_display_status(
    *,
    db_status: str,
    job: "IngestionJob | None",
    chunk_count: int,
    embedding_count: int,
    now: datetime,
) -> tuple[str, list[str]]:
    """Return (displayStatus, healthWarnings).

    Priority:
    1. Searchable data (chunk>0, embedding>0) → completed (job status shown as warning only)
    2. No searchable data + active non-stale job → queued/processing
    3. chunk>0, embedding==0 → needs_reindex
    4. stale job without index → stale_failed
    5. db_status fallback
    """
    warnings: list[str] = []
    job_status = (job.status or "").lower() if job else ""
    stale, _ = _is_stale_job(job, now=now)

    # Searchable data wins over any job status — show completed, job progress is secondary
    if chunk_count > 0 and embedding_count > 0:
        if embedding_count < chunk_count:
            warnings.append(f"일부 임베딩 누락: {embedding_count}/{chunk_count}")
        if job_status in {"processing", "running"} and not stale:
            warnings.append("재색인 처리 중입니다. 이전 데이터로 검색 가능합니다.")
        elif job_status in {"queued", "pending"} and not stale:
            warnings.append("재색인 대기 중입니다. 이전 데이터로 검색 가능합니다.")
        return "completed", warnings

    # No searchable data → show active job status
    if job_status in {"processing", "running"} and not stale:
        return "processing", warnings
    if job_status in {"queued", "pending"} and not stale:
        return "queued", warnings

    # Chunks without embeddings
    if chunk_count > 0 and embedding_count == 0:
        warnings.append("임베딩이 없어 검색이 불가합니다. 재색인이 필요합니다.")
        return "needs_reindex", warnings

    # Stale job with no usable index
    if stale:
        warnings.append("이전 색인 작업이 시간 초과되었습니다. 재색인이 필요합니다.")
        return "stale_failed", warnings

    if db_status == "failed":
        return "failed", warnings

    return db_status or "queued", warnings


def _log_ingest_health(
    *,
    knowledge_id: "uuid.UUID",
    db_status: str,
    job_status: str | None,
    display_status: str,
    chunk_count: int,
    embedding_count: int,
    reason: str,
) -> None:
    logger.info(
        "[INGEST_HEALTH] knowledge_id=%s db_status=%s job_status=%s display_status=%s chunk_count=%s embedding_count=%s reason=%s",
        knowledge_id,
        db_status,
        job_status or "",
        display_status,
        chunk_count,
        embedding_count,
        reason,
    )


def _job_recovery_action(job: IngestionJob | None) -> str | None:
    metadata = dict(job.metadata_json or {}) if job else {}
    action = metadata.get("staleRecovery")
    return action if isinstance(action, str) and action else None


def _is_reindex_required(
    *,
    status_value: str,
    extracted_text_length: int | None,
    chunk_count: int | None,
    embedding_count: int | None,
) -> bool:
    text_len = int(extracted_text_length or 0)
    chunks = int(chunk_count or 0)
    embeddings = int(embedding_count or 0)
    if status_value == "failed":
        return True
    if status_value in {"queued", "processing"}:
        return False
    if text_len == 0 or chunks == 0 or embeddings == 0:
        return True
    return embeddings < chunks


def _is_stale_job(job: IngestionJob | None, *, now: datetime) -> tuple[bool, str]:
    if job is None:
        return False, ""
    job_status = (job.status or "").lower()
    if job_status == "queued":
        reference = max((value for value in [job.created_at, job.updated_at] if value), default=now)
        if now - reference >= STALE_QUEUED_AFTER:
            return True, "queued_timeout"
    if job_status == "processing":
        reference = max((value for value in [job.started_at, job.updated_at, job.created_at] if value), default=now)
        if now - reference >= STALE_PROCESSING_AFTER:
            return True, "processing_timeout"
    return False, ""


def _is_explicit_reindex_job(job: IngestionJob | None) -> bool:
    return bool(job and "reindex" in str(job.job_type or "").lower())


def _clear_stale_recovery_metadata(job: IngestionJob | None) -> None:
    if job is None:
        return
    metadata = dict(job.metadata_json or {})
    metadata.pop("staleRecovery", None)
    metadata.pop("staleRecoveryMessage", None)
    job.metadata_json = metadata


def _mark_job_completed_from_existing(job: IngestionJob | None, *, now: datetime, message: str) -> None:
    if job is None or (job.status or "").lower() not in {"queued", "pending", "processing", "running"}:
        return
    job.status = "completed"
    job.current_step = "completed"
    job.progress_percent = 100
    job.error_code = None
    job.error_message = None
    job.finished_at = now
    metadata = dict(job.metadata_json or {})
    metadata["staleRecovery"] = "completed_from_existing_chunks"
    metadata["staleRecoveryMessage"] = message
    job.metadata_json = metadata


def _mark_job_failed_stale(job: IngestionJob | None, *, now: datetime, message: str) -> None:
    if job is None or (job.status or "").lower() not in {"queued", "pending", "processing", "running"}:
        return
    job.status = "failed"
    job.current_step = "failed"
    job.progress_percent = 100
    job.error_code = "STALE_INGESTION_JOB"
    job.error_message = message
    job.finished_at = now
    metadata = dict(job.metadata_json or {})
    metadata["staleRecovery"] = "failed_stale"
    metadata["staleRecoveryMessage"] = message
    job.metadata_json = metadata


def _recover_document_ingest_state(doc: Document, version: DocumentVersion | None, job: IngestionJob | None) -> bool:
    if version is None:
        return False
    now = datetime.now(UTC)
    old_status = version.status
    stale, stale_reason = _is_stale_job(job, now=now)
    chunks = int(version.chunk_count or 0)
    embeddings = int(version.embedding_count or 0)
    # searchable = chunks AND embeddings both present (text_len not required)
    has_existing_index = chunks > 0 and embeddings > 0
    source_type = version.source_type or "file"

    should_complete_from_existing = has_existing_index and (
        stale
        or (job is None and (version.status or "").lower() in {"queued", "processing"})
    ) and not _is_explicit_reindex_job(job)
    if should_complete_from_existing:
        version.status = "completed"
        version.error_code = None
        version.error_message = None
        version.processed_at = version.processed_at or doc.processed_at or now
        version.is_active = True
        doc.status = "active"
        doc.processed_at = doc.processed_at or version.processed_at
        _mark_job_completed_from_existing(job, now=now, message="chunk/embedding already exist")
        _log_ingest_recovery(knowledge_id=doc.id, action="completed_from_existing_chunks", reason="chunk_embedding_counts_present")
        _log_ingest_status(
            knowledge_id=doc.id,
            source_type=source_type,
            old_status=old_status,
            new_status=version.status,
            chunk_count=chunks,
            embedding_count=embeddings,
            reason="completed_from_existing_chunks",
        )
        return True

    # stale job with no usable index → mark failed so user can reindex
    if stale and ((chunks == 0 or embeddings == 0) or _is_explicit_reindex_job(job)):
        message = "색인 작업이 제한 시간을 초과했습니다. 재색인이 필요합니다."
        if has_existing_index and _is_explicit_reindex_job(job):
            version.status = "completed"
            version.error_code = None
            version.error_message = None
            version.is_active = True
            doc.status = "active"
        else:
            version.status = "failed"
            version.error_code = "STALE_INGESTION_JOB"
            version.error_message = message
            doc.status = "failed"
        version.processed_at = now
        doc.processed_at = now
        _mark_job_failed_stale(job, now=now, message=message)
        _log_ingest_recovery(knowledge_id=doc.id, action="failed_stale", reason=stale_reason)
        _log_ingest_status(
            knowledge_id=doc.id,
            source_type=source_type,
            old_status=old_status,
            new_status=version.status,
            chunk_count=chunks,
            embedding_count=embeddings,
            reason=stale_reason,
        )
        return True
    return False


def _recover_web_ingest_state(web_source: WebSource, job: IngestionJob | None) -> bool:
    now = datetime.now(UTC)
    old_status = web_source.status
    stale, stale_reason = _is_stale_job(job, now=now)
    chunks = int(web_source.chunk_count or 0)
    embeddings = int(web_source.embedding_count or 0)
    # searchable = chunks AND embeddings both present (text_len not required)
    has_existing_index = chunks > 0 and embeddings > 0

    should_complete_from_existing = has_existing_index and (
        stale
        or (job is None and (web_source.status or "").lower() in {"queued", "processing"})
    ) and not _is_explicit_reindex_job(job)
    if should_complete_from_existing:
        web_source.status = "active"
        web_source.last_error_code = None
        web_source.last_error_message = None
        web_source.last_synced_at = web_source.last_synced_at or now
        _mark_job_completed_from_existing(job, now=now, message="chunk/embedding already exist")
        _log_ingest_recovery(knowledge_id=web_source.id, action="completed_from_existing_chunks", reason="chunk_embedding_counts_present")
        _log_ingest_status(
            knowledge_id=web_source.id,
            source_type="website",
            old_status=old_status,
            new_status="completed",
            chunk_count=chunks,
            embedding_count=embeddings,
            reason="completed_from_existing_chunks",
        )
        return True

    # stale job with no usable index → mark failed so user can reindex
    if stale and ((chunks == 0 or embeddings == 0) or _is_explicit_reindex_job(job)):
        message = "색인 작업이 제한 시간을 초과했습니다. 재색인이 필요합니다."
        web_source.status = "active" if has_existing_index and _is_explicit_reindex_job(job) else "failed"
        web_source.last_error_code = "STALE_INGESTION_JOB"
        web_source.last_error_message = message
        web_source.last_synced_at = now
        _mark_job_failed_stale(job, now=now, message=message)
        _log_ingest_recovery(knowledge_id=web_source.id, action="failed_stale", reason=stale_reason)
        _log_ingest_status(
            knowledge_id=web_source.id,
            source_type="website",
            old_status=old_status,
            new_status="failed",
            chunk_count=chunks,
            embedding_count=embeddings,
            reason=stale_reason,
        )
        return True
    return False


def _document_item(doc: Document, version: DocumentVersion | None, job: IngestionJob | None) -> KnowledgeItem:
    metadata = dict(doc.metadata_json or {})
    tags = _parse_tags(metadata.get("tags"))
    is_website_attachment = metadata.get("sourceType") == "website_attachment"
    source_type = "text" if version and version.source_type == "text" else "file"
    source_label = version.file_name if version else None
    summary = metadata.get("summary") or _truncate_preview(metadata.get("content_preview"))
    if not summary:
        summary = _truncate_preview(doc.description) or _truncate_preview(metadata.get("memo")) or source_label
    is_active = bool(version.is_active) if version else doc.status not in {"inactive", "deprecated"}
    ingestion_status = job.status if job else version.status if version else None
    extracted_text_length = version.extracted_text_length if version else 0
    chunk_count = int(version.chunk_count or 0) if version else 0
    embedding_count = int(version.embedding_count or 0) if version else 0
    status_value = _counts_terminal_status(
        extracted_text_length=extracted_text_length,
        chunk_count=chunk_count,
        embedding_count=embedding_count,
        base_status=doc.status,
        ingestion_status=ingestion_status,
        is_active=is_active,
    )
    now = datetime.now(UTC)
    display_status, health_warnings = _compute_display_status(
        db_status=status_value,
        job=job,
        chunk_count=chunk_count,
        embedding_count=embedding_count,
        now=now,
    )
    can_search = chunk_count > 0 and embedding_count > 0
    if display_status != status_value:
        _log_ingest_health(
            knowledge_id=doc.id,
            db_status=status_value,
            job_status=ingestion_status,
            display_status=display_status,
            chunk_count=chunk_count,
            embedding_count=embedding_count,
            reason="display_differs_from_db",
        )
    error_message = (job.error_message if job and job.error_message else None) or (version.error_message if version else None)
    indexed_at = None
    if version and version.processed_at:
        indexed_at = version.processed_at.isoformat()
    elif doc.processed_at:
        indexed_at = doc.processed_at.isoformat()
    source_url = metadata.get("url") or metadata.get("attachment_url") or metadata.get("parent_website_url")
    return KnowledgeItem(
        id=str(doc.id),
        source_group="file_text",
        source_type=source_type,
        title=doc.title,
        category=doc.category,
        field=metadata.get("field"),
        tags=tags,
        memo=metadata.get("memo"),
        summary=summary,
        status=status_value,
        display_status=display_status,
        can_search=can_search,
        health_warnings=health_warnings,
        source_label=source_label,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
        indexed_at=indexed_at,
        effective_date=_iso_date(version.effective_date if version else _parse_date(metadata.get("effective_date"), "effective_date")),
        expiration_date=_iso_date(version.expiration_date if version else _parse_date(metadata.get("expiration_date"), "expiration_date")),
        department=(version.issuing_department if version else None) or metadata.get("department"),
        sensitive_detected=bool(metadata.get("sensitive_detected", False)),
        error_message=error_message,
        extracted_text_length=extracted_text_length,
        chunk_count=chunk_count,
        embedding_count=embedding_count,
        last_processed_at=indexed_at,
        file_name=version.file_name if version else None,
        source_url=source_url if isinstance(source_url, str) else None,
        final_url=metadata.get("final_url") if isinstance(metadata.get("final_url"), str) else None,
        http_status_code=metadata.get("http_status_code") if isinstance(metadata.get("http_status_code"), int) else None,
        ingestion_job_id=(str(job.id) if job else None),
        ingestion_status=ingestion_status,
        ingestion_progress_percent=(job.progress_percent if job else None),
        stale_recovered=bool(_job_recovery_action(job)),
        recovery_action=_job_recovery_action(job),
        reindex_required=_is_reindex_required(
            status_value=status_value,
            extracted_text_length=extracted_text_length,
            chunk_count=chunk_count,
            embedding_count=embedding_count,
        ),
        is_active=is_active,
        is_website_attachment=bool(is_website_attachment),
        parent_website_url=metadata.get("parent_website_url"),
    )


def _document_detail(doc: Document, version: DocumentVersion | None, job: IngestionJob | None) -> KnowledgeDetailResponse:
    item = _document_item(doc, version, job)
    metadata = dict(doc.metadata_json or {})
    return KnowledgeDetailResponse(
        **item.model_dump(exclude={"effective_date", "expiration_date", "department"}),
        file_name=(version.file_name if version else None),
        source_path=(version.storage_key if version else None),
        last_indexed_at=item.indexed_at,
        extraction_method=(metadata.get("extraction_method") if isinstance(metadata.get("extraction_method"), str) else None),
        effective_date=_iso_date(version.effective_date if version else None) or metadata.get("effective_date"),
        expiration_date=_iso_date(version.expiration_date if version else None) or metadata.get("expiration_date"),
        department=(version.issuing_department if version else None) or metadata.get("department"),
    )


def _website_item(web_source: WebSource, job: IngestionJob | None) -> KnowledgeItem:
    metadata = dict(web_source.metadata_json or {})
    # is_active: whether the source is enabled by the admin (not derived from indexing status)
    is_active = not web_source.is_deleted and web_source.status not in {"inactive", "deprecated"}
    chunk_count = int(web_source.chunk_count or 0)
    embedding_count = int(web_source.embedding_count or 0)
    status_value = _counts_terminal_status(
        extracted_text_length=web_source.extracted_text_length or 0,
        chunk_count=chunk_count,
        embedding_count=embedding_count,
        base_status=web_source.status,
        ingestion_status=(job.status if job else None),
        is_active=is_active,
    )
    now = datetime.now(UTC)
    display_status, health_warnings = _compute_display_status(
        db_status=status_value,
        job=job,
        chunk_count=chunk_count,
        embedding_count=embedding_count,
        now=now,
    )
    can_search = chunk_count > 0 and embedding_count > 0
    if display_status != status_value:
        _log_ingest_health(
            knowledge_id=web_source.id,
            db_status=status_value,
            job_status=(job.status if job else None),
            display_status=display_status,
            chunk_count=chunk_count,
            embedding_count=embedding_count,
            reason="display_differs_from_db",
        )
    return KnowledgeItem(
        id=str(web_source.id),
        source_group="website",
        source_type="website",
        title=web_source.name,
        category=metadata.get("category"),
        field=metadata.get("field"),
        tags=_parse_tags(metadata.get("tags")),
        memo=metadata.get("memo"),
        summary=metadata.get("summary") or _truncate_preview(metadata.get("memo")) or web_source.base_url,
        status=status_value,
        display_status=display_status,
        can_search=can_search,
        health_warnings=health_warnings,
        source_label=web_source.base_url,
        created_at=web_source.created_at.isoformat(),
        updated_at=web_source.updated_at.isoformat(),
        indexed_at=(web_source.last_synced_at.isoformat() if web_source.last_synced_at else None),
        effective_date=metadata.get("effective_date"),
        expiration_date=metadata.get("expiration_date"),
        department=metadata.get("department"),
        sensitive_detected=bool(metadata.get("sensitive_detected", False)),
        error_message=(job.error_message if job and job.error_message else None) or web_source.last_error_message,
        extracted_text_length=web_source.extracted_text_length or 0,
        chunk_count=chunk_count,
        embedding_count=embedding_count,
        last_processed_at=(web_source.last_synced_at.isoformat() if web_source.last_synced_at else None),
        file_name=None,
        source_url=web_source.base_url,
        final_url=web_source.final_url or (metadata.get("final_url") if isinstance(metadata.get("final_url"), str) else None),
        http_status_code=web_source.http_status_code,
        ingestion_job_id=(str(job.id) if job else None),
        ingestion_status=(job.status if job else None),
        ingestion_progress_percent=(job.progress_percent if job else None),
        stale_recovered=bool(_job_recovery_action(job)),
        recovery_action=_job_recovery_action(job),
        reindex_required=_is_reindex_required(
            status_value=status_value,
            extracted_text_length=web_source.extracted_text_length or 0,
            chunk_count=chunk_count,
            embedding_count=embedding_count,
        ),
        is_active=is_active,
    )


def _website_detail(web_source: WebSource, job: IngestionJob | None) -> KnowledgeDetailResponse:
    item = _website_item(web_source, job)
    metadata = dict(web_source.metadata_json or {})
    return KnowledgeDetailResponse(
        **item.model_dump(),
        url=web_source.base_url,
        source_path=web_source.base_url,
        last_indexed_at=item.indexed_at,
        crawl_page_limit=_resolve_crawl_page_limit(metadata),
        crawl_all_pages=_resolve_crawl_all_pages(metadata),
        include_attachments=_resolve_include_attachments(metadata),
        excluded_paths=_normalize_excluded_paths(list(web_source.excluded_paths or [])),
        crawled_urls=list(metadata.get("crawled_urls") or []),
        crawled_page_count=metadata.get("crawled_page_count"),
        attachment_files=list(metadata.get("attachment_files") or []),
        attachment_file_count=metadata.get("attachment_file_count"),
    )


def _matches_query(item: KnowledgeItem, query: str | None) -> bool:
    if not query:
        return True
    haystack = " ".join(
        [
            item.title or "",
            item.summary or "",
            item.memo or "",
            " ".join(item.tags),
            item.category or "",
            item.field or "",
            item.source_label or "",
        ]
    ).lower()
    return query.lower() in haystack


def _matches_filter(item: KnowledgeItem, *, category: str | None, field: str | None, status_filter: str | None) -> bool:
    if category and item.category != category:
        return False
    if field and item.field != field:
        return False
    if status_filter and item.status != status_filter:
        return False
    return True


def _check_python_package(module_name: str) -> KnowledgeRuntimeDependencyItem:
    try:
        module = __import__(module_name)
        module_path = getattr(module, "__file__", None)
        return KnowledgeRuntimeDependencyItem(installed=True, path=str(module_path) if module_path else None)
    except Exception as exc:  # noqa: BLE001
        return KnowledgeRuntimeDependencyItem(installed=False, detail=f"{exc.__class__.__name__}: {exc}")


def _check_system_binary(binary_name: str) -> KnowledgeRuntimeDependencyItem:
    resolved_path = shutil.which(binary_name)
    if resolved_path:
        return KnowledgeRuntimeDependencyItem(installed=True, path=resolved_path)
    return KnowledgeRuntimeDependencyItem(installed=False, detail="NOT_FOUND")


def get_knowledge_runtime_status_service(*, principal: AdminPrincipal) -> KnowledgeRuntimeStatusResponse:
    require_institution_organization_id(principal)

    python_packages = {
        "pypdf": _check_python_package("pypdf"),
        "pdf2image": _check_python_package("pdf2image"),
        "pytesseract": _check_python_package("pytesseract"),
        "PIL": _check_python_package("PIL"),
    }
    system_binaries = {
        "tesseract": _check_system_binary("tesseract"),
        "pdftoppm": _check_system_binary("pdftoppm"),
        "pdfinfo": _check_system_binary("pdfinfo"),
    }

    ocr_ready = (
        python_packages["pdf2image"].installed
        and python_packages["pytesseract"].installed
        and python_packages["PIL"].installed
        and system_binaries["tesseract"].installed
        and system_binaries["pdftoppm"].installed
        and system_binaries["pdfinfo"].installed
    )
    scanned_pdf_ready = python_packages["pypdf"].installed and ocr_ready

    notes: list[str] = []
    if not scanned_pdf_ready:
        notes.append("이미지형 스캔 PDF는 Tesseract OCR과 Poppler(pdftoppm, pdfinfo)가 모두 있어야 정상 색인됩니다.")
    if not python_packages["pypdf"].installed:
        notes.append("텍스트형 PDF 추출용 pypdf Python 패키지가 필요합니다.")
    if not system_binaries["tesseract"].installed:
        notes.append("Tesseract 실행 파일이 없어 OCR을 실행할 수 없습니다.")
    if not (system_binaries["pdftoppm"].installed and system_binaries["pdfinfo"].installed):
        notes.append("Poppler 실행 파일(pdftoppm, pdfinfo)이 없어 PDF를 OCR용 이미지로 변환할 수 없습니다.")

    return KnowledgeRuntimeStatusResponse(
        ocr_ready=bool(ocr_ready),
        scanned_pdf_ready=bool(scanned_pdf_ready),
        python_packages=python_packages,
        system_binaries=system_binaries,
        notes=notes,
    )


def list_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    source_group: str | None,
    query: str | None,
    category: str | None,
    field: str | None,
    status_filter: str | None,
) -> KnowledgeListResponse:
    organization_id = require_institution_organization_id(principal)
    items: list[KnowledgeItem] = []
    recovered = False
    if source_group in {None, "", "file_text"}:
        for doc, version, job in list_document_knowledge_rows(db, organization_id=organization_id):
            recovered = _recover_document_ingest_state(doc, version, job) or recovered
            item = _document_item(doc, version, job)
            if _matches_query(item, query) and _matches_filter(item, category=category, field=field, status_filter=status_filter):
                items.append(item)
    if source_group in {None, "", "website"}:
        for web_source, job in list_web_source_knowledge_rows(db, organization_id=organization_id):
            recovered = _recover_web_ingest_state(web_source, job) or recovered
            item = _website_item(web_source, job)
            if _matches_query(item, query) and _matches_filter(item, category=category, field=field, status_filter=status_filter):
                items.append(item)
    if recovered:
        db.commit()
    items.sort(key=lambda item: item.updated_at, reverse=True)
    return KnowledgeListResponse(items=items)


def list_knowledge_diagnostics_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> list[KnowledgeItem]:
    return list_knowledge_service(
        db,
        principal=principal,
        source_group=None,
        query=None,
        category=None,
        field=None,
        status_filter=None,
    ).items


def get_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    knowledge_id: str,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    document_row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if document_row is not None:
        if _recover_document_ingest_state(document_row[0], document_row[1], document_row[2]):
            db.commit()
        return _document_detail(document_row[0], document_row[1], document_row[2])
    web_source_row = get_web_source_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if web_source_row is not None:
        if _recover_web_ingest_state(web_source_row[0], web_source_row[1]):
            db.commit()
        return _website_detail(web_source_row[0], web_source_row[1])
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KNOWLEDGE_NOT_FOUND")


def _apply_common_metadata(metadata: dict, body: KnowledgeUpsertRequest) -> dict:
    next_metadata = dict(metadata)
    if body.field is not None:
        next_metadata["field"] = body.field
    if body.tags is not None:
        next_metadata["tags"] = _parse_tags(body.tags)
    if body.memo is not None:
        next_metadata["memo"] = body.memo
    if body.department is not None:
        next_metadata["department"] = body.department
    if body.effective_date is not None:
        _parse_date(body.effective_date, "effective_date")
        next_metadata["effective_date"] = body.effective_date
    if body.expiration_date is not None:
        _parse_date(body.expiration_date, "expiration_date")
        next_metadata["expiration_date"] = body.expiration_date
    if body.crawl_page_limit is not None:
        next_metadata["crawl_page_limit"] = max(1, min(int(body.crawl_page_limit), MAX_CRAWL_PAGE_LIMIT))
    if body.crawl_all_pages is not None:
        next_metadata["crawl_all_pages"] = bool(body.crawl_all_pages)
    if body.include_attachments is not None:
        next_metadata["include_attachments"] = bool(body.include_attachments)
    return next_metadata


def patch_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    knowledge_id: str,
    body: KnowledgeUpsertRequest,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    document_row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if document_row is not None:
        doc, version, _job = document_row
        ensure_document_in_scope(db, principal=principal, document_id=knowledge_id)
        if body.title is not None:
            doc.title = body.title.strip()
        if body.category is not None:
            doc.category = body.category.strip() or None
        doc.metadata_json = _apply_common_metadata(doc.metadata_json or {}, body)
        if version is not None:
            if body.department is not None:
                version.issuing_department = body.department.strip() or None
            if body.effective_date is not None:
                version.effective_date = _parse_date(body.effective_date, "effective_date")
            if body.expiration_date is not None:
                version.expiration_date = _parse_date(body.expiration_date, "expiration_date")
            if body.is_active is not None:
                version.is_active = body.is_active
        if body.is_active is not None:
            doc.status = "active" if body.is_active else "inactive"
        db.commit()
        return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)

    web_source_row = get_web_source_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if web_source_row is not None:
        web_source, _job = web_source_row
        ensure_web_source_in_scope(db, principal=principal, web_source_id=knowledge_id)
        if body.title is not None:
            web_source.name = body.title.strip()
        metadata = _apply_common_metadata(web_source.metadata_json or {}, body)
        if body.category is not None:
            metadata["category"] = body.category
        if body.excluded_paths is not None:
            web_source.excluded_paths = _normalize_excluded_paths(body.excluded_paths)
        web_source.metadata_json = metadata
        if body.is_active is not None:
            web_source.status = "active" if body.is_active else "inactive"
        db.commit()
        return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KNOWLEDGE_NOT_FOUND")


def delete_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    knowledge_id: str,
) -> None:
    organization_id = require_institution_organization_id(principal)
    document_row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if document_row is not None:
        doc = ensure_document_in_scope(db, principal=principal, document_id=knowledge_id)
        doc.deleted_at = datetime.now(UTC)
        doc.status = "deprecated"
        db.commit()
        return

    web_source_row = get_web_source_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if web_source_row is not None:
        web_source = ensure_web_source_in_scope(db, principal=principal, web_source_id=knowledge_id)
        web_source.is_deleted = True
        web_source.deleted_at = datetime.now(UTC)
        web_source.status = "inactive"
        db.commit()
        return

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KNOWLEDGE_NOT_FOUND")


def _mark_reindex_failed(
    db: Session,
    *,
    job_id: str,
    error_code: str,
    error_message: str,
) -> None:
    job = db.get(IngestionJob, uuid.UUID(job_id))
    if job is None:
        return
    now = datetime.now(UTC)
    job.status = "failed"
    job.current_step = "failed"
    job.progress_percent = 100
    job.error_code = error_code
    job.error_message = error_message
    job.finished_at = now
    if job.web_source_id is not None:
        web_source = db.get(WebSource, job.web_source_id)
        if web_source is not None:
            old_status = web_source.status
            web_source.status = "failed"
            web_source.last_synced_at = now
            web_source.last_error_code = error_code
            web_source.last_error_message = error_message
            _log_ingest_status(
                knowledge_id=web_source.id,
                source_type="website",
                old_status=old_status,
                new_status="failed",
                chunk_count=web_source.chunk_count or 0,
                embedding_count=web_source.embedding_count or 0,
                reason=error_code,
            )
    if job.document_version_id is not None:
        version = db.get(DocumentVersion, job.document_version_id)
        if version is not None:
            old_status = version.status
            version.status = "failed"
            version.error_code = error_code
            version.error_message = error_message
            version.processed_at = now
            _log_ingest_status(
                knowledge_id=version.document_id,
                source_type=version.source_type or "file",
                old_status=old_status,
                new_status="failed",
                chunk_count=version.chunk_count or 0,
                embedding_count=version.embedding_count or 0,
                reason=error_code,
            )
    if job.document_id is not None:
        document = db.get(Document, job.document_id)
        if document is not None:
            document.status = "failed"
            document.processed_at = now


def _process_reindex_job(principal: AdminPrincipal, knowledge_id: str, job_id: str) -> None:
    db = SessionLocal()
    try:
        organization_id = require_institution_organization_id(principal)
        job = db.get(IngestionJob, uuid.UUID(job_id))
        if job is None:
            logger.warning("[REINDEX] knowledge_id=%s skipped reason=queued_job_not_found", knowledge_id)
            return
        if str(job.organization_id) != organization_id or job.status != "queued":
            logger.warning("[REINDEX] knowledge_id=%s skipped reason=job_not_queued job_id=%s", knowledge_id, job_id)
            return
        logger.info("[REINDEX] knowledge_id=%s started job_id=%s", knowledge_id, job_id)
        job.status = "processing"
        job.current_step = "processing"
        job.progress_percent = max(int(job.progress_percent or 0), 5)
        job.started_at = datetime.now(UTC)
        if job.document_id is not None:
            document = db.get(Document, job.document_id)
            if document is not None:
                document.status = "processing"
        if job.web_source_id is not None:
            web_source_for_status = db.get(WebSource, job.web_source_id)
            if web_source_for_status is not None:
                web_source_for_status.status = "processing"
        db.commit()
        logger.info("[REINDEX] knowledge_id=%s status=processing job_id=%s", knowledge_id, job_id)

        if job.document_id is not None:
            doc = ensure_document_in_scope(db, principal=principal, document_id=str(job.document_id))
            version = db.get(DocumentVersion, job.document_version_id) if job.document_version_id else None
            if version is None:
                _mark_reindex_failed(
                    db,
                    job_id=job_id,
                    error_code="DOCUMENT_VERSION_MISSING",
                    error_message="재색인할 문서 버전을 찾지 못했습니다.",
                )
            else:
                storage_path = _resolve_reindex_storage_path(doc, version)
                if storage_path is not None:
                    content_type = version.mime_type
                    if str(storage_path).endswith(".txt") and not (content_type or "").startswith("text/"):
                        content_type = "text/plain"
                    file_bytes = storage_path.read_bytes()
                else:
                    rebuilt_text = _rebuild_text_from_existing_chunks(db, doc, version)
                    content_type = "text/plain"
                    file_bytes = rebuilt_text.encode("utf-8")

                if file_bytes:
                    _rag_settings = _load_rag_settings_for_chatbot(
                        db,
                        organization_id=organization_id,
                        chatbot_id=str(doc.chatbot_id),
                    )
                    _ingest_document_version_content(
                        db,
                        organization_id=organization_id,
                        chatbot_id=str(doc.chatbot_id),
                        document=doc,
                        version=version,
                        job=job,
                        file_name=version.file_name,
                        file_bytes=file_bytes,
                        content_type=content_type,
                        rag_settings=_rag_settings,
                    )
                else:
                    _mark_reindex_failed(
                        db,
                        job_id=job_id,
                        error_code="DOCUMENT_STORAGE_MISSING",
                        error_message="재색인할 원본 파일, 추출 텍스트 또는 기존 청크를 찾지 못했습니다.",
                    )
        elif job.web_source_id is not None:
            web_source = ensure_web_source_in_scope(db, principal=principal, web_source_id=str(job.web_source_id))
            _rag_settings = _load_rag_settings_for_chatbot(
                db,
                organization_id=organization_id,
                chatbot_id=str(web_source.chatbot_id),
            )
            _ingest_web_source_content(
                db,
                organization_id=organization_id,
                chatbot_id=str(web_source.chatbot_id),
                web_source=web_source,
                job=job,
                rag_settings=_rag_settings,
            )

        db.commit()
        completed_job = db.get(IngestionJob, uuid.UUID(job_id)) if job_id else None
        if completed_job is not None and completed_job.status in {"queued", "processing"}:
            _mark_reindex_failed(
                db,
                job_id=job_id,
                error_code="REINDEX_INCOMPLETE",
                error_message="재색인이 완료 상태로 종료되지 않았습니다.",
            )
            db.commit()
            completed_job = db.get(IngestionJob, uuid.UUID(job_id))
        logger.info(
            "[REINDEX] knowledge_id=%s %s",
            knowledge_id,
            "failed" if completed_job is not None and completed_job.status == "failed" else "completed",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("[REINDEX] knowledge_id=%s failed error_code=VECTOR_SAVE_ERROR", knowledge_id)
        if job_id:
            _mark_reindex_failed(
                db,
                job_id=job_id,
                error_code="VECTOR_SAVE_ERROR",
                error_message=f"임베딩 벡터 저장 중 DB 오류가 발생했습니다: {exc}",
            )
            db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception("[REINDEX] knowledge_id=%s failed", knowledge_id)
        if job_id:
            _mark_reindex_failed(db, job_id=job_id, error_code="REINDEX_FAILED", error_message=str(exc))
            db.commit()
    finally:
        db.close()


def reindex_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    knowledge_id: str,
    background_tasks=None,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    document_row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if document_row is not None:
        doc, version, _job = document_row
        ensure_document_in_scope(db, principal=principal, document_id=knowledge_id)
        if version is not None:
            version.status = "queued"
        doc.status = "processing"
        job = IngestionJob(
            organization_id=uuid.UUID(organization_id),
            chatbot_id=doc.chatbot_id,
            document_id=doc.id,
            document_version_id=(version.id if version else None),
            created_by_admin_id=uuid.UUID(principal.admin_id),
            job_type="document_reindex",
            status="queued",
            current_step="queued",
            progress_percent=0,
            metadata_json={"trigger": "admin_reindex"},
        )
        db.add(job)
        db.commit()
        logger.info("[REINDEX] knowledge_id=%s queued job_id=%s", knowledge_id, job.id)
        if background_tasks is not None:
            background_tasks.add_task(_process_reindex_job, principal, knowledge_id, str(job.id))
        return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)

    web_source_row = get_web_source_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if web_source_row is not None:
        web_source, _job = web_source_row
        ensure_web_source_in_scope(db, principal=principal, web_source_id=knowledge_id)
        web_source.status = "processing"
        job = IngestionJob(
            organization_id=uuid.UUID(organization_id),
            chatbot_id=web_source.chatbot_id,
            web_source_id=web_source.id,
            created_by_admin_id=uuid.UUID(principal.admin_id),
            job_type="web_source_reindex",
            status="queued",
            current_step="queued",
            progress_percent=0,
            metadata_json={"trigger": "admin_reindex"},
        )
        db.add(job)
        db.commit()
        logger.info("[REINDEX] knowledge_id=%s queued job_id=%s", knowledge_id, job.id)
        if background_tasks is not None:
            background_tasks.add_task(_process_reindex_job, principal, knowledge_id, str(job.id))
        return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KNOWLEDGE_NOT_FOUND")


async def create_file_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    file: UploadFile,
    title: str,
    category: str | None,
    field: str | None,
    tags: str | None,
    memo: str | None,
    effective_date: str | None,
    department: str | None,
    use_vision: bool = False,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    if getattr(chatbot, "skip_duplicate_file_reindex", False):
        existing_doc = db.execute(
            select(Document).where(
                Document.organization_id == uuid.UUID(organization_id),
                Document.chatbot_id == chatbot.id,
                Document.title == title.strip(),
                Document.status == "active",
                Document.deleted_at.is_(None),
            )
        ).scalar_one_or_none()
        if existing_doc is not None:
            return get_knowledge_service(db, principal=principal, knowledge_id=str(existing_doc.id))

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="EMPTY_FILE")
    KNOWLEDGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    file_suffix = Path(file.filename or "upload.bin").suffix or ".bin"
    upload_headers = getattr(file, "headers", None)
    upload_content_type = (
        upload_headers.get("content-type")
        if upload_headers is not None and hasattr(upload_headers, "get")
        else None
    ) or _guess_mime_type_from_name(file.filename)
    storage_name = f"{uuid.uuid4()}{file_suffix}"
    storage_path = KNOWLEDGE_STORAGE_DIR / storage_name
    storage_path.write_bytes(content)

    doc = Document(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        title=title.strip(),
        category=(category.strip() if category else None),
        description=(memo.strip() if memo else None),
        status="active",
        uploaded_at=datetime.now(UTC),
        metadata_json={
            "field": field.strip() if field else None,
            "tags": _parse_tags(tags),
            "memo": memo.strip() if memo else None,
            "department": department.strip() if department else None,
            "effective_date": effective_date,
            "summary": file.filename,
            "sensitive_detected": False,
            "original_storage_key": str(storage_path),
        },
    )
    db.add(doc)
    db.flush()

    version = DocumentVersion(
        organization_id=uuid.UUID(organization_id),
        document_id=doc.id,
        chatbot_id=chatbot.id,
        version_number=1,
        file_name=file.filename or storage_name,
        file_size_bytes=len(content),
        storage_key=str(storage_path),
        mime_type=upload_content_type,
        source_type="file",
        corpus_domain=doc.corpus_domain,
        effective_date=_parse_date(effective_date, "effective_date"),
        issuing_department=(department.strip() if department else None),
        status="queued",
    )
    db.add(version)
    db.flush()
    doc.current_version_id = version.id

    job = IngestionJob(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        document_id=doc.id,
        document_version_id=version.id,
        created_by_admin_id=uuid.UUID(principal.admin_id),
        job_type="document_upload",
        status="queued",
        current_step="uploaded",
        progress_percent=5,
        metadata_json={"sourceType": "file"},
    )
    db.add(job)
    db.flush()
    _rag_settings = _load_rag_settings_for_chatbot(
        db,
        organization_id=organization_id,
        chatbot_id=str(chatbot.id),
    )
    _ingest_document_version_content(
        db,
        organization_id=organization_id,
        chatbot_id=str(chatbot.id),
        document=doc,
        version=version,
        job=job,
        file_name=file.filename or storage_name,
        file_bytes=content,
        content_type=upload_content_type,
        metadata_updates={"sourceType": "file"},
        rag_settings=_rag_settings,
        use_vision=use_vision,
    )
    db.commit()
    return get_knowledge_service(db, principal=principal, knowledge_id=str(doc.id))


def create_text_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: KnowledgeTextCreateRequest,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    KNOWLEDGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4()}.txt"
    storage_path = KNOWLEDGE_STORAGE_DIR / storage_name
    storage_path.write_text(body.content, encoding="utf-8")
    sensitive_detected = _detect_sensitive(body.content)
    preview = _truncate_preview(body.content)

    doc = Document(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        title=body.title.strip(),
        category=(body.category.strip() if body.category else None),
        description=preview,
        status="active",
        uploaded_at=datetime.now(UTC),
        metadata_json={
            "field": body.field.strip() if body.field else None,
            "tags": _parse_tags(body.tags),
            "memo": body.memo.strip() if body.memo else None,
            "department": body.department.strip() if body.department else None,
            "effective_date": body.effective_date,
            "content_preview": preview,
            "summary": preview,
            "sensitive_detected": sensitive_detected,
        },
    )
    db.add(doc)
    db.flush()

    version = DocumentVersion(
        organization_id=uuid.UUID(organization_id),
        document_id=doc.id,
        chatbot_id=chatbot.id,
        version_number=1,
        file_name=f"{body.title.strip()}.txt",
        file_size_bytes=len(body.content.encode("utf-8")),
        storage_key=str(storage_path),
        mime_type="text/plain",
        source_type="text",
        corpus_domain=doc.corpus_domain,
        effective_date=_parse_date(body.effective_date, "effective_date"),
        issuing_department=(body.department.strip() if body.department else None),
        status="queued",
    )
    db.add(version)
    db.flush()
    doc.current_version_id = version.id

    job = IngestionJob(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        document_id=doc.id,
        document_version_id=version.id,
        created_by_admin_id=uuid.UUID(principal.admin_id),
        job_type="text_ingestion",
        status="queued",
        current_step="saved",
        progress_percent=5,
        metadata_json={"sourceType": "text"},
    )
    db.add(job)
    db.flush()
    _rag_settings = _load_rag_settings_for_chatbot(
        db,
        organization_id=organization_id,
        chatbot_id=str(chatbot.id),
    )
    _ingest_document_version_content(
        db,
        organization_id=organization_id,
        chatbot_id=str(chatbot.id),
        document=doc,
        version=version,
        job=job,
        file_name=f"{body.title.strip()}.txt",
        file_bytes=body.content.encode("utf-8"),
        content_type="text/plain",
        metadata_updates={"sourceType": "text"},
        rag_settings=_rag_settings,
    )
    db.commit()
    return get_knowledge_service(db, principal=principal, knowledge_id=str(doc.id))


def create_text_knowledge_internal(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    title: str,
    content: str,
    tags: list[str] | None = None,
) -> str:
    """
    스테이징 등록용 내부 함수 — principal 없이 직접 텍스트 지식 생성.
    Returns: created document id (str)
    """
    from app.models.chatbot_settings import ChatbotSetting as _ChatbotSetting  # noqa: PLC0415
    chatbot = db.execute(
        select(_ChatbotSetting).where(_ChatbotSetting.id == uuid.UUID(chatbot_id))
    ).scalar_one_or_none()
    if chatbot is None:
        raise ValueError(f"CHATBOT_NOT_FOUND: {chatbot_id}")

    KNOWLEDGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4()}.txt"
    storage_path = KNOWLEDGE_STORAGE_DIR / storage_name
    storage_path.write_text(content, encoding="utf-8")

    sensitive_detected = _detect_sensitive(content)
    preview = _truncate_preview(content)

    doc = Document(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        title=title.strip(),
        description=preview,
        status="active",
        uploaded_at=datetime.now(UTC),
        metadata_json={
            "tags": tags or [],
            "content_preview": preview,
            "summary": preview,
            "sensitive_detected": sensitive_detected,
            "source": "staging",
        },
    )
    db.add(doc)
    db.flush()

    version = DocumentVersion(
        organization_id=uuid.UUID(organization_id),
        document_id=doc.id,
        chatbot_id=chatbot.id,
        version_number=1,
        file_name=f"{title.strip()}.txt",
        file_size_bytes=len(content.encode("utf-8")),
        storage_key=str(storage_path),
        mime_type="text/plain",
        source_type="text",
        corpus_domain=doc.corpus_domain,
        status="queued",
    )
    db.add(version)
    db.flush()
    doc.current_version_id = version.id

    job = IngestionJob(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        document_id=doc.id,
        document_version_id=version.id,
        job_type="text_ingestion",
        status="queued",
        current_step="saved",
        progress_percent=5,
        metadata_json={"sourceType": "text", "source": "staging"},
    )
    db.add(job)
    db.flush()

    _rag_settings = _load_rag_settings_for_chatbot(
        db, organization_id=organization_id, chatbot_id=chatbot_id
    )
    _ingest_document_version_content(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        document=doc,
        version=version,
        job=job,
        file_name=f"{title.strip()}.txt",
        file_bytes=content.encode("utf-8"),
        content_type="text/plain",
        metadata_updates={"sourceType": "text"},
        rag_settings=_rag_settings,
    )
    db.commit()
    return str(doc.id)


def create_website_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: KnowledgeWebsiteCreateRequest,
    background_tasks=None,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    canonical_url = _canonicalize_website_url(body.url)
    parsed = urlparse(canonical_url)
    hostname = parsed.hostname or ""
    allowed_domains = [domain.lower() for domain in list(chatbot.allowed_domains or []) if domain]
    if allowed_domains and not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed_domains):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="WEBSITE_DOMAIN_NOT_ALLOWED")
    duplicate_stmt = select(WebSource).where(
        WebSource.organization_id == uuid.UUID(organization_id),
        WebSource.chatbot_id == chatbot.id,
        WebSource.is_deleted.is_(False),
        WebSource.base_url == canonical_url,
    )
    if db.execute(duplicate_stmt).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WEBSITE_ALREADY_REGISTERED")

    excluded_paths = _normalize_excluded_paths(body.excluded_paths)
    crawl_page_limit = max(1, min(body.crawl_page_limit, MAX_CRAWL_PAGE_LIMIT))
    crawl_all_pages = bool(body.crawl_all_pages)
    include_attachments = bool(body.include_attachments)

    web_source = WebSource(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        name=body.title.strip(),
        base_url=canonical_url,
        status="active",
        sync_mode="manual",
        allowed_domains=sorted(set(allowed_domains + [hostname])) if hostname else allowed_domains,
        excluded_paths=excluded_paths,
        metadata_json={
            "category": body.category.strip() if body.category else None,
            "field": body.field.strip() if body.field else None,
            "tags": _parse_tags(body.tags),
            "memo": body.memo.strip() if body.memo else None,
            "department": body.department.strip() if body.department else None,
            "summary": canonical_url,
            "sensitive_detected": False,
            "crawl_page_limit": crawl_page_limit,
            "crawl_all_pages": crawl_all_pages,
            "include_attachments": include_attachments,
        },
    )
    db.add(web_source)
    db.flush()

    job = IngestionJob(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        web_source_id=web_source.id,
        created_by_admin_id=uuid.UUID(principal.admin_id),
        job_type="web_source_sync",
        status="queued",
        current_step="registered",
        progress_percent=0,
        metadata_json={"sourceType": "website", "url": canonical_url},
    )
    db.add(job)
    db.commit()  # 즉시 커밋 — 크롤링은 background task에서 처리
    logger.info("[WEBSITE_CREATE] web_source_id=%s queued job_id=%s", web_source.id, job.id)
    if background_tasks is not None:
        background_tasks.add_task(_process_reindex_job, principal, str(web_source.id), str(job.id))
    return get_knowledge_service(db, principal=principal, knowledge_id=str(web_source.id))

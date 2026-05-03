import re
import ssl
import uuid
import zlib
from datetime import UTC, date, datetime
from hashlib import sha256
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
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

KNOWLEDGE_STORAGE_DIR = Path(__file__).resolve().parents[3] / "storage" / "knowledge"
SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{6}-\d{7}\b"),
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
]
USER_AGENT = "IEUMBOTCrawler/1.0 (+https://ieumbot.local)"
DEFAULT_CRAWL_PAGE_LIMIT = 12
MAX_CRAWL_PAGE_LIMIT = 100
SKIP_FILE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".zip",
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


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._chunks: list[str] = []
        self._links: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if tag == "a" and self._skip_depth == 0:
            href = dict(attrs).get("href")
            if isinstance(href, str) and href.strip():
                self._links.append(href.strip())
        if self._skip_depth == 0 and tag in {"p", "br", "div", "section", "article", "li", "h1", "h2", "h3"}:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if self._skip_depth == 0 and tag in {"p", "div", "section", "article", "li"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:  # type: ignore[override]
        if self._skip_depth == 0:
            self._chunks.append(data)

    def get_text(self) -> str:
        text = "".join(self._chunks)
        lines = [" ".join(line.split()) for line in text.splitlines()]
        normalized = "\n".join(line for line in lines if line)
        return normalized.strip()

    def get_links(self) -> list[str]:
        return self._links[:]


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


def _split_text_chunks(text: str, *, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    normalized = text.strip()
    if not normalized:
        return []

    paragraphs = [part.strip() for part in normalized.split("\n") if part.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= chunk_size:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(paragraph) <= chunk_size:
            current = paragraph
            continue
        start = 0
        while start < len(paragraph):
            end = min(len(paragraph), start + chunk_size)
            piece = paragraph[start:end].strip()
            if piece:
                chunks.append(piece)
            if end >= len(paragraph):
                break
            start = max(end - overlap, start + 1)
        current = ""

    if current:
        chunks.append(current)

    return chunks


def _fetch_website_page(url: str) -> tuple[str, str, list[str]]:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    opener = build_opener(
        ProxyHandler({}),
        HTTPSHandler(context=ssl.create_default_context()),
    )
    with opener.open(request, timeout=20) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        html = response.read().decode(charset, errors="replace")
    extractor = _HTMLTextExtractor()
    extractor.feed(html)
    return html, extractor.get_text(), extractor.get_links()


def _fetch_binary_resource(url: str) -> tuple[bytes, str | None]:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        },
    )
    opener = build_opener(
        ProxyHandler({}),
        HTTPSHandler(context=ssl.create_default_context()),
    )
    with opener.open(request, timeout=20) as response:
        content_type = response.headers.get_content_type()
        payload = response.read()
    return payload, content_type


def _guess_file_type_from_url(url: str) -> str:
    path = (urlparse(url).path or "").lower()
    return Path(path).suffix.lower()


def _guess_file_name_from_url(url: str) -> str:
    path = urlparse(url).path or ""
    name = Path(path).name
    return name or url


def _is_attachment_url(url: str) -> bool:
    return _guess_file_type_from_url(url) in ATTACHMENT_FILE_EXTENSIONS


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


def _extract_pdf_text_best_effort(file_bytes: bytes) -> str:
    parts: list[str] = []
    try:
        import pypdf  # type: ignore

        reader = pypdf.PdfReader(BytesIO(file_bytes))
        for page in reader.pages:
            text = _strip_binary_noise(page.extract_text() or "")
            if text:
                parts.append(text)
        return "\n".join(parts).strip()
    except Exception:  # noqa: BLE001
        pass

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
        for candidate in (payload,):
            append_strings(candidate)
        try:
            inflated = zlib.decompress(payload)
            append_strings(inflated)
        except Exception:  # noqa: BLE001
            continue
    return "\n".join(parts).strip()


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


def _extract_attachment_text(file_url: str, file_bytes: bytes, content_type: str | None) -> tuple[str, str]:
    file_type = _guess_file_type_from_url(file_url)
    if file_type == ".pdf":
        return _extract_pdf_text_best_effort(file_bytes), file_type
    if file_type == ".docx":
        return _extract_docx_text(file_bytes), file_type
    if file_type == ".xlsx":
        return _extract_xlsx_text(file_bytes), file_type
    if file_type == ".pptx":
        return _extract_pptx_text(file_bytes), file_type
    if file_type == ".hwpx":
        return _extract_hwpx_text(file_bytes), file_type
    if file_type == ".hwp":
        return _extract_hwp_text_best_effort(file_bytes), file_type
    if content_type and content_type.startswith(TEXTISH_MIME_PREFIXES):
        return _strip_binary_noise(file_bytes.decode("utf-8", errors="ignore")), file_type
    return "", file_type


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
    raw_value = (metadata or {}).get("crawl_page_limit")
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = DEFAULT_CRAWL_PAGE_LIMIT
    return max(1, min(value, MAX_CRAWL_PAGE_LIMIT))


def _normalize_crawl_url(base_url: str, href: str) -> str | None:
    absolute = urljoin(base_url, href)
    absolute, _fragment = urldefrag(absolute)
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    lowered_path = parsed.path.lower()
    if any(lowered_path.endswith(ext) for ext in SKIP_FILE_EXTENSIONS):
        return None
    if any(lowered_path.endswith(ext) for ext in ATTACHMENT_FILE_EXTENSIONS):
        return absolute
    return absolute


def _same_domain(url: str, hostname: str) -> bool:
    parsed = urlparse(url)
    target = (parsed.hostname or "").lower()
    root = hostname.lower()
    return bool(target) and (target == root or target.endswith(f".{root}"))


def _crawl_website(
    base_url: str,
    *,
    crawl_depth: int,
    max_pages: int,
    excluded_paths: list[str] | None,
) -> tuple[str, str, list[str], list[str]]:
    parsed_root = urlparse(base_url)
    root_hostname = parsed_root.hostname or ""
    normalized_excluded = _normalize_excluded_paths(excluded_paths)
    queue: list[tuple[str, int]] = [(base_url, 0)]
    visited: set[str] = set()
    crawled_urls: list[str] = []
    attachment_urls: list[str] = []
    attachment_seen: set[str] = set()
    text_blocks: list[str] = []
    html_blocks: list[str] = []

    max_depth = max(0, crawl_depth)
    page_limit = max(1, min(max_pages, MAX_CRAWL_PAGE_LIMIT))

    while queue and len(crawled_urls) < page_limit:
        current_url, depth = queue.pop(0)
        if current_url in visited:
            continue
        visited.add(current_url)
        if not _same_domain(current_url, root_hostname):
            continue
        current_path = urlparse(current_url).path or "/"
        if any(current_path.startswith(path) for path in normalized_excluded):
            continue

        html, text, links = _fetch_website_page(current_url)
        crawled_urls.append(current_url)
        html_blocks.append(html)
        if text:
            text_blocks.append(f"[URL] {current_url}\n{text}")

        if depth >= max_depth:
            continue

        for href in links:
            normalized = _normalize_crawl_url(current_url, href)
            if not normalized or normalized in visited:
                continue
            if not _same_domain(normalized, root_hostname):
                continue
            normalized_path = urlparse(normalized).path or "/"
            if any(normalized_path.startswith(path) for path in normalized_excluded):
                continue
            if _is_attachment_url(normalized):
                if normalized not in attachment_seen:
                    attachment_seen.add(normalized)
                    attachment_urls.append(normalized)
                continue
            queue.append((normalized, depth + 1))

    return "\n\n".join(html_blocks), "\n\n".join(text_blocks).strip(), crawled_urls, attachment_urls


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
        Document.metadata_json["web_source_id"].astext == web_source_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def _set_job_failed(
    *,
    web_source: WebSource,
    job: IngestionJob,
    error_code: str,
    error_message: str,
) -> None:
    now = datetime.now(UTC)
    web_source.last_error_code = error_code
    web_source.last_error_message = error_message
    job.status = "failed"
    job.current_step = "failed"
    job.progress_percent = 100
    job.error_code = error_code
    job.error_message = error_message
    job.finished_at = now


def _collect_attachment_contents(
    attachment_urls: list[str],
) -> tuple[list[dict[str, str | int | bool | None]], list[str]]:
    attachment_items: list[dict[str, str | int | bool | None]] = []
    attachment_text_blocks: list[str] = []

    for url in attachment_urls:
        file_name = _guess_file_name_from_url(url)
        file_type = _guess_file_type_from_url(url)
        mime_type = ATTACHMENT_MIME_HINTS.get(file_type)
        try:
            payload, detected_content_type = _fetch_binary_resource(url)
            if detected_content_type:
                mime_type = detected_content_type
            extracted_text, detected_file_type = _extract_attachment_text(url, payload, mime_type)
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
                    "extraction_status": status,
                    "error_message": None,
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
                    "extraction_status": "failed",
                    "error_message": f"HTTP_{exc.code}",
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
                    "extraction_status": "failed",
                    "error_message": str(exc),
                }
            )

    return attachment_items, attachment_text_blocks


def _ingest_web_source_content(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    web_source: WebSource,
    job: IngestionJob,
) -> None:
    now = datetime.now(UTC)
    job.status = "processing"
    job.current_step = "fetching"
    job.progress_percent = 10
    job.started_at = now
    job.attempt_count = (job.attempt_count or 0) + 1
    db.flush()

    try:
        crawl_page_limit = _resolve_crawl_page_limit(web_source.metadata_json)
        html, extracted_text, crawled_urls, attachment_urls = _crawl_website(
            web_source.base_url,
            crawl_depth=web_source.crawl_depth,
            max_pages=crawl_page_limit,
            excluded_paths=list(web_source.excluded_paths or []),
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

    attachment_files, attachment_text_blocks = _collect_attachment_contents(attachment_urls)
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
                "attachment_files": attachment_files,
                "attachment_file_count": len(attachment_files),
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
            "attachment_files": attachment_files,
            "attachment_file_count": len(attachment_files),
        }
        for version in document.versions:
            version.is_active = False
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
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
        is_active=True,
        issuing_department=web_metadata.get("department"),
        status="processing",
        checksum_sha256=content_hash,
    )
    db.add(version)
    db.flush()

    chunks = _split_text_chunks(combined_text)
    if not chunks:
        _set_job_failed(
            web_source=web_source,
            job=job,
            error_code="EMPTY_WEBSITE_CHUNKS",
            error_message="색인 가능한 웹사이트 텍스트가 없습니다.",
        )
        version.status = "failed"
        version.error_code = "EMPTY_WEBSITE_CHUNKS"
        version.error_message = "색인 가능한 웹사이트 텍스트가 없습니다."
        return

    for index, chunk_text in enumerate(chunks, start=1):
        db.add(
            DocumentChunk(
                organization_id=uuid.UUID(organization_id),
                document_id=document.id,
                chatbot_id=uuid.UUID(chatbot_id),
                document_version_id=version.id,
                chunk_order=index,
                page_number=None,
                section_title=web_source.name,
                corpus_domain="official_website_indexed",
                text_content=chunk_text,
                metadata_json={
                    "sourceType": "website",
                    "web_source_id": str(web_source.id),
                    "url": web_source.base_url,
                },
                token_count=len(chunk_text.split()),
                content_hash=sha256(chunk_text.encode("utf-8")).hexdigest(),
            )
        )

    version.status = "completed"
    version.processed_at = now
    version.error_code = None
    version.error_message = None
    document.current_version_id = version.id
    document.processed_at = now
    document.status = "active"
    web_source.status = "active"
    web_source.last_synced_at = now
    web_source.last_error_code = None
    web_source.last_error_message = None
    web_source.metadata_json = {
        **web_metadata,
        "summary": _truncate_preview(combined_text, 220) or web_source.base_url,
        "sensitive_detected": _detect_sensitive(combined_text),
        "indexed_chunk_count": len(chunks),
        "crawled_urls": crawled_urls,
        "crawled_page_count": len(crawled_urls),
        "crawl_page_limit": crawl_page_limit,
        "attachment_files": attachment_files,
        "attachment_file_count": len(attachment_files),
    }
    job.status = "completed"
    job.current_step = "completed"
    job.progress_percent = 100
    job.error_code = None
    job.error_message = None
    job.finished_at = now


def _normalize_status(base_status: str | None, *, is_active: bool, ingestion_status: str | None) -> str:
    base = (base_status or "").lower()
    ingestion = (ingestion_status or "").lower()
    if not is_active or base in {"inactive", "deprecated", "deleted"}:
        return "inactive"
    if ingestion in {"failed", "error"} or base == "failed":
        return "failed"
    if ingestion in {"queued", "pending", "processing", "running"} or base in {"queued", "processing"}:
        return "processing"
    return "ready"


def _document_item(doc: Document, version: DocumentVersion | None, job: IngestionJob | None) -> KnowledgeItem:
    metadata = dict(doc.metadata_json or {})
    tags = _parse_tags(metadata.get("tags"))
    source_type = "text" if version and version.source_type == "text" else "file"
    source_label = version.file_name if version else None
    summary = metadata.get("summary") or _truncate_preview(metadata.get("content_preview"))
    if not summary:
        summary = _truncate_preview(doc.description) or _truncate_preview(metadata.get("memo")) or source_label
    is_active = bool(version.is_active) if version else doc.status not in {"inactive", "deprecated"}
    status_value = _normalize_status(doc.status, is_active=is_active, ingestion_status=(job.status if job else version.status if version else None))
    error_message = (job.error_message if job and job.error_message else None) or (version.error_message if version else None)
    indexed_at = None
    if version and version.processed_at:
        indexed_at = version.processed_at.isoformat()
    elif doc.processed_at:
        indexed_at = doc.processed_at.isoformat()
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
        source_label=source_label,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
        indexed_at=indexed_at,
        effective_date=_iso_date(version.effective_date if version else _parse_date(metadata.get("effective_date"), "effective_date")),
        expiration_date=_iso_date(version.expiration_date if version else _parse_date(metadata.get("expiration_date"), "expiration_date")),
        department=(version.issuing_department if version else None) or metadata.get("department"),
        sensitive_detected=bool(metadata.get("sensitive_detected", False)),
        error_message=error_message,
        ingestion_job_id=(str(job.id) if job else None),
        ingestion_status=(job.status if job else version.status if version else None),
        ingestion_progress_percent=(job.progress_percent if job else None),
        is_active=is_active,
    )


def _document_detail(doc: Document, version: DocumentVersion | None, job: IngestionJob | None) -> KnowledgeDetailResponse:
    item = _document_item(doc, version, job)
    metadata = dict(doc.metadata_json or {})
    return KnowledgeDetailResponse(
        **item.model_dump(),
        file_name=(version.file_name if version else None),
        source_path=(version.storage_key if version else None),
        last_indexed_at=item.indexed_at,
        effective_date=_iso_date(version.effective_date if version else None) or metadata.get("effective_date"),
        expiration_date=_iso_date(version.expiration_date if version else None) or metadata.get("expiration_date"),
        department=(version.issuing_department if version else None) or metadata.get("department"),
    )


def _website_item(web_source: WebSource, job: IngestionJob | None) -> KnowledgeItem:
    metadata = dict(web_source.metadata_json or {})
    is_active = web_source.status == "active"
    status_value = _normalize_status(web_source.status, is_active=is_active, ingestion_status=(job.status if job else None))
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
        source_label=web_source.base_url,
        created_at=web_source.created_at.isoformat(),
        updated_at=web_source.updated_at.isoformat(),
        indexed_at=(web_source.last_synced_at.isoformat() if web_source.last_synced_at else None),
        effective_date=metadata.get("effective_date"),
        expiration_date=metadata.get("expiration_date"),
        department=metadata.get("department"),
        sensitive_detected=bool(metadata.get("sensitive_detected", False)),
        error_message=(job.error_message if job and job.error_message else None) or web_source.last_error_message,
        ingestion_job_id=(str(job.id) if job else None),
        ingestion_status=(job.status if job else None),
        ingestion_progress_percent=(job.progress_percent if job else None),
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
    if source_group in {None, "", "file_text"}:
        for doc, version, job in list_document_knowledge_rows(db, organization_id=organization_id):
            item = _document_item(doc, version, job)
            if _matches_query(item, query) and _matches_filter(item, category=category, field=field, status_filter=status_filter):
                items.append(item)
    if source_group in {None, "", "website"}:
        for web_source, job in list_web_source_knowledge_rows(db, organization_id=organization_id):
            item = _website_item(web_source, job)
            if _matches_query(item, query) and _matches_filter(item, category=category, field=field, status_filter=status_filter):
                items.append(item)
    items.sort(key=lambda item: item.updated_at, reverse=True)
    return KnowledgeListResponse(items=items)


def get_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    knowledge_id: str,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    document_row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if document_row is not None:
        return _document_detail(document_row[0], document_row[1], document_row[2])
    web_source_row = get_web_source_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if web_source_row is not None:
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


def reindex_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    knowledge_id: str,
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    document_row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if document_row is not None:
        doc, version, _job = document_row
        ensure_document_in_scope(db, principal=principal, document_id=knowledge_id)
        if version is not None:
            version.status = "queued"
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
        return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)

    web_source_row = get_web_source_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if web_source_row is not None:
        web_source, _job = web_source_row
        ensure_web_source_in_scope(db, principal=principal, web_source_id=knowledge_id)
        web_source.status = "active"
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
        db.flush()
        _ingest_web_source_content(
            db,
            organization_id=organization_id,
            chatbot_id=str(web_source.chatbot_id),
            web_source=web_source,
            job=job,
        )
        db.commit()
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
) -> KnowledgeDetailResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="EMPTY_FILE")
    KNOWLEDGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    file_suffix = Path(file.filename or "upload.bin").suffix or ".bin"
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
        mime_type=file.content_type or "application/octet-stream",
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
    db.commit()
    return get_knowledge_service(db, principal=principal, knowledge_id=str(doc.id))


def create_website_knowledge_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: KnowledgeWebsiteCreateRequest,
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
    db.flush()
    _ingest_web_source_content(
        db,
        organization_id=organization_id,
        chatbot_id=str(chatbot.id),
        web_source=web_source,
        job=job,
    )
    db.commit()
    return get_knowledge_service(db, principal=principal, knowledge_id=str(web_source.id))

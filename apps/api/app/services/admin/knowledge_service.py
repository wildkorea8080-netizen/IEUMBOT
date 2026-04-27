import re
import uuid
from datetime import UTC, datetime, date
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import Document, DocumentVersion, IngestionJob, WebSource
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
    return KnowledgeDetailResponse(
        **item.model_dump(),
        url=web_source.base_url,
        source_path=web_source.base_url,
        last_indexed_at=item.indexed_at,
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
    parsed = urlparse(body.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_WEBSITE_URL")
    hostname = parsed.hostname or ""
    allowed_domains = [domain.lower() for domain in list(chatbot.allowed_domains or []) if domain]
    if allowed_domains and not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed_domains):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="WEBSITE_DOMAIN_NOT_ALLOWED")

    web_source = WebSource(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=chatbot.id,
        name=body.title.strip(),
        base_url=body.url.strip(),
        status="active",
        sync_mode="manual",
        allowed_domains=sorted(set(allowed_domains + [hostname])) if hostname else allowed_domains,
        metadata_json={
            "category": body.category.strip() if body.category else None,
            "field": body.field.strip() if body.field else None,
            "tags": _parse_tags(body.tags),
            "memo": body.memo.strip() if body.memo else None,
            "department": body.department.strip() if body.department else None,
            "summary": body.url.strip(),
            "sensitive_detected": False,
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
        metadata_json={"sourceType": "website", "url": body.url.strip()},
    )
    db.add(job)
    db.commit()
    return get_knowledge_service(db, principal=principal, knowledge_id=str(web_source.id))

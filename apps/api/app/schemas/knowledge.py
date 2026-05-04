from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

KnowledgeSourceGroup = Literal["file_text", "website"]
KnowledgeSourceType = Literal["file", "text", "website"]


class KnowledgeAttachmentItem(ApiSchema):
    url: str | None = None
    file_name: str | None = None
    file_type: str | None = None
    mime_type: str | None = None
    text_length: int | None = None
    extracted: bool | None = None
    extraction_method: str | None = None
    extraction_status: str | None = None
    error_message: str | None = None


class KnowledgeItem(ApiSchema):
    id: str
    source_group: KnowledgeSourceGroup
    source_type: KnowledgeSourceType
    title: str
    category: str | None = None
    field: str | None = None
    tags: list[str] = Field(default_factory=list)
    memo: str | None = None
    summary: str | None = None
    status: str
    source_label: str | None = None
    created_at: str
    updated_at: str
    indexed_at: str | None = None
    effective_date: str | None = None
    expiration_date: str | None = None
    department: str | None = None
    sensitive_detected: bool = False
    error_message: str | None = None
    ingestion_job_id: str | None = None
    ingestion_status: str | None = None
    ingestion_progress_percent: int | None = None
    is_active: bool = True
    is_website_attachment: bool = False
    parent_website_url: str | None = None


class KnowledgeListResponse(ApiSchema):
    items: list[KnowledgeItem]


class KnowledgeDetailResponse(KnowledgeItem):
    file_name: str | None = None
    url: str | None = None
    source_path: str | None = None
    last_indexed_at: str | None = None
    extraction_method: str | None = None
    crawl_page_limit: int | None = None
    crawl_all_pages: bool = True
    include_attachments: bool = True
    excluded_paths: list[str] = Field(default_factory=list)
    crawled_urls: list[str] = Field(default_factory=list)
    crawled_page_count: int | None = None
    attachment_files: list[KnowledgeAttachmentItem] = Field(default_factory=list)
    attachment_file_count: int | None = None


class KnowledgeUpsertRequest(ApiSchema):
    title: str | None = None
    category: str | None = None
    field: str | None = None
    tags: list[str] | None = None
    memo: str | None = None
    effective_date: str | None = None
    expiration_date: str | None = None
    department: str | None = None
    crawl_page_limit: int | None = Field(default=None, ge=1, le=1000)
    crawl_all_pages: bool | None = None
    include_attachments: bool | None = None
    excluded_paths: list[str] | None = None
    is_active: bool | None = None


class KnowledgeTextCreateRequest(ApiSchema):
    chatbot_id: str
    title: str
    content: str
    category: str | None = None
    field: str | None = None
    tags: list[str] = Field(default_factory=list)
    memo: str | None = None
    effective_date: str | None = None
    department: str | None = None


class KnowledgeWebsiteCreateRequest(ApiSchema):
    chatbot_id: str
    url: str
    title: str
    crawl_page_limit: int = Field(default=300, ge=1, le=1000)
    crawl_all_pages: bool = True
    include_attachments: bool = True
    excluded_paths: list[str] = Field(default_factory=list)
    category: str | None = None
    field: str | None = None
    tags: list[str] = Field(default_factory=list)
    memo: str | None = None
    department: str | None = None


class KnowledgeRuntimeDependencyItem(ApiSchema):
    installed: bool
    path: str | None = None
    detail: str | None = None


class KnowledgeRuntimeStatusResponse(ApiSchema):
    ocr_ready: bool
    scanned_pdf_ready: bool
    python_packages: dict[str, KnowledgeRuntimeDependencyItem]
    system_binaries: dict[str, KnowledgeRuntimeDependencyItem]
    notes: list[str] = Field(default_factory=list)

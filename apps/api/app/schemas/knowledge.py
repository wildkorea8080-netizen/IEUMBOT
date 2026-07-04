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
    # displayStatus: the recommended value for UI (accounts for stale jobs, partial embeddings, etc.)
    display_status: str | None = None
    can_search: bool = False
    health_warnings: list[str] = Field(default_factory=list)
    source_label: str | None = None
    created_at: str
    updated_at: str
    indexed_at: str | None = None
    effective_date: str | None = None
    expiration_date: str | None = None
    department: str | None = None
    sensitive_detected: bool = False
    error_message: str | None = None
    extracted_text_length: int | None = 0
    chunk_count: int | None = 0
    embedding_count: int | None = 0
    last_processed_at: str | None = None
    file_name: str | None = None
    source_url: str | None = None
    final_url: str | None = None
    http_status_code: int | None = None
    ingestion_job_id: str | None = None
    ingestion_status: str | None = None
    ingestion_progress_percent: int | None = None
    stale_recovered: bool = False
    recovery_action: str | None = None
    reindex_required: bool = False
    is_active: bool = True
    is_website_attachment: bool = False
    parent_website_url: str | None = None
    web_source_id: str | None = None


class KnowledgeListResponse(ApiSchema):
    items: list[KnowledgeItem]


class KnowledgeDetailResponse(KnowledgeItem):
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
    # "web"(기본, 크롤링) | "api"(공식 OpenAPI 수집). api면 url=엔드포인트, api_config 사용.
    source_kind: str = "web"
    api_config: dict | None = None


class KnowledgeApiPreviewRequest(ApiSchema):
    url: str
    api_config: dict | None = None


class KnowledgeApiPreviewItem(ApiSchema):
    title: str
    content_preview: str
    url: str | None = None


class KnowledgeApiPreviewResponse(ApiSchema):
    count: int
    items: list[KnowledgeApiPreviewItem]


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


# ── FAQ 재분석 (2단계 파이프라인) ─────────────────────────────────────────────

class FaqAnalyzeRequest(ApiSchema):
    chatbot_id: str
    max_topics: int = Field(default=6, ge=1, le=10)
    faqs_per_topic: int = Field(default=2, ge=1, le=4)


class FaqSuggestedItem(ApiSchema):
    question: str
    answer: str
    tags: list[str] = Field(default_factory=list)
    topic: str
    category: str | None = None
    field: str | None = None


class FaqAnalyzedTopic(ApiSchema):
    topic: str
    description: str
    category: str | None = None
    field: str | None = None
    chunk_indices: list[int] = Field(default_factory=list)
    faqs: list[FaqSuggestedItem] = Field(default_factory=list)


class FaqAnalyzeResponse(ApiSchema):
    knowledge_id: str
    document_title: str
    topics: list[FaqAnalyzedTopic]
    total_faqs: int


# ── 스마트 일괄 등록 (per-FAQ category/field) ──────────────────────────────────

class FaqBulkCreateItem(ApiSchema):
    question: str
    answer: str
    tags: list[str] = Field(default_factory=list)
    category: str | None = None
    field: str | None = None


class FaqBulkCreateRequest(ApiSchema):
    chatbot_id: str
    faqs: list[FaqBulkCreateItem]


class FaqBulkCreateResponse(ApiSchema):
    created: int
    failed: int
    faq_ids: list[str]

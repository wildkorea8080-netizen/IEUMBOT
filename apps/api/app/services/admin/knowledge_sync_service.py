"""
지식 URL 자동 동기화 서비스 (Sprint 3-C).

APScheduler 에서 1시간마다 sync_all_due_web_sources() 호출.
변경 감지: 크롤링 텍스트의 SHA-256 해시와 source_hash 비교.
변경 시: 기존 reindex 흐름으로 청킹 + 임베딩 업데이트.
실패: 전체 try/except, 로그만 기록 — 서버 크래시 없음.
"""

import hashlib
import html
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.web_sources import WebSource
from app.services.web_fetcher import fetch as web_fetch

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT = 15
_MAX_TEXT_BYTES = 500_000  # 최대 500KB


# ── 결과 타입 ─────────────────────────────────────────────────────────────────

@dataclass
class SyncResult:
    web_source_id: str
    changed: bool
    chunks_updated: int
    synced_at: datetime
    error: str | None = None


# ── 단순 URL 크롤러 (단일 페이지) ─────────────────────────────────────────────

def _simple_html_to_text(html_content: str) -> str:
    """간단한 HTML → 텍스트 변환 (script/style 제거 후 태그 strip)."""
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html_content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def crawl_url(url: str) -> tuple[str, str]:
    """
    단일 URL 크롤링 → (텍스트 내용, SHA-256 해시).
    실패 시 예외를 raise.
    """
    result = web_fetch(url, timeout_seconds=_REQUEST_TIMEOUT, max_bytes=_MAX_TEXT_BYTES)
    text = _simple_html_to_text(result.text)
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return text, content_hash


# ── 동기화 핵심 로직 ──────────────────────────────────────────────────────────

def calculate_next_sync(sync_interval_days: int) -> datetime:
    return datetime.now(UTC) + timedelta(days=sync_interval_days)


def sync_web_source(web_source_id: str, db: Session) -> SyncResult:
    """
    단일 WebSource 동기화.
    1. URL 크롤링
    2. source_hash 비교
    3. 변경됐으면 기존 지식 재색인 트리거
    4. last_synced_at / next_sync_at / source_hash 갱신
    """
    now = datetime.now(UTC)

    row = db.execute(
        select(WebSource).where(WebSource.id == web_source_id)
    ).scalar_one_or_none()

    if row is None:
        return SyncResult(
            web_source_id=web_source_id, changed=False, chunks_updated=0,
            synced_at=now, error="WebSource not found",
        )

    url = row.base_url
    try:
        _, new_hash = crawl_url(url)
    except Exception as exc:
        error_msg = str(exc)[:200]
        row.last_error_code = "CRAWL_FAILED"
        row.last_error_message = error_msg
        if row.sync_interval_days:
            row.next_sync_at = calculate_next_sync(row.sync_interval_days)
        db.commit()
        logger.warning("[KNOWLEDGE_SYNC] crawl failed url=%s error=%s", url, error_msg)
        return SyncResult(
            web_source_id=web_source_id, changed=False, chunks_updated=0,
            synced_at=now, error=error_msg,
        )

    changed = (row.source_hash != new_hash)
    chunks_updated = 0

    if changed:
        logger.info("[KNOWLEDGE_SYNC] 변경 감지 url=%s → 재색인 트리거", url)
        try:
            from app.db import SessionLocal  # noqa: PLC0415
            from app.services.admin.knowledge_service import _create_website_knowledge_background  # noqa: PLC0415
            # 재색인: 별도 세션으로 실행 (기존 reindex 로직 재사용)
            with SessionLocal() as reindex_db:
                _trigger_reindex_for_web_source(
                    reindex_db,
                    web_source_id=str(row.id),
                    organization_id=str(row.organization_id),
                    chatbot_id=str(row.chatbot_id),
                )
            chunks_updated = 1  # 실제 청크 수는 재색인 후 업데이트됨
        except Exception as exc:
            logger.warning("[KNOWLEDGE_SYNC] 재색인 실패 url=%s: %s", url, exc)

    row.source_hash = new_hash
    row.last_synced_at = now
    row.last_error_code = None
    row.last_error_message = None
    if row.sync_interval_days:
        row.next_sync_at = calculate_next_sync(row.sync_interval_days)
    db.commit()

    return SyncResult(
        web_source_id=web_source_id,
        changed=changed,
        chunks_updated=chunks_updated,
        synced_at=now,
    )


def _trigger_reindex_for_web_source(
    db: Session,
    *,
    web_source_id: str,
    organization_id: str,
    chatbot_id: str,
) -> None:
    """기존 reindex 로직을 직접 호출 (BackgroundTasks 없이)."""
    from app.services.admin.knowledge_service import (  # noqa: PLC0415
        list_web_source_knowledge_service,
        reindex_knowledge_service,
    )
    from app.api.dependencies.auth import AdminPrincipal  # noqa: PLC0415

    # web_source_id로 연결된 document 목록을 찾아 재색인
    principal = AdminPrincipal(
        admin_id="system_scheduler",
        organization_id=organization_id,
        role="institution_admin",
        source_role="institution_admin",
        is_impersonating=False,
        impersonation_expires_at=None,
        impersonation_reason=None,
    )
    # web_source에 연결된 documents 재색인
    from sqlalchemy import and_, select  # noqa: PLC0415
    from app.models.documents import Document  # noqa: PLC0415
    from app.models.ingestion_jobs import IngestionJob  # noqa: PLC0415
    from app.services.admin.knowledge_service import _process_reindex_job  # noqa: PLC0415
    from app.models.web_sources import WebSource  # noqa: PLC0415

    ws = db.execute(
        select(WebSource).where(WebSource.id == web_source_id)
    ).scalar_one_or_none()
    if ws is None:
        return

    # 해당 web source와 연결된 document를 찾음 (metadata_json에 webSourceId 저장됨)
    docs = db.execute(
        select(Document).where(
            Document.chatbot_id == ws.chatbot_id,
            Document.organization_id == ws.organization_id,
            Document.status == "active",
        )
    ).scalars().all()

    for doc in docs:
        meta = doc.metadata_json or {}
        if str(meta.get("webSourceId", "")) == web_source_id:
            # 기존 버전의 재색인 트리거
            from app.models.document_versions import DocumentVersion  # noqa: PLC0415
            version = db.execute(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .order_by(DocumentVersion.version_number.desc())
                .limit(1)
            ).scalar_one_or_none()
            if version:
                job = IngestionJob(
                    organization_id=doc.organization_id,
                    chatbot_id=doc.chatbot_id,
                    document_id=doc.id,
                    document_version_id=version.id,
                    status="queued",
                    job_type="reindex",
                    triggered_by="scheduler",
                )
                db.add(job)
                version.status = "queued"
                db.commit()
                logger.info("[KNOWLEDGE_SYNC] 재색인 큐 등록 document_id=%s", doc.id)


# ── 스케줄러 진입점 ────────────────────────────────────────────────────────────

def sync_all_due_web_sources() -> None:
    """
    APScheduler가 1시간마다 호출.
    next_sync_at <= now() 인 활성 WebSource를 모두 동기화.
    실패해도 서버 크래시 없음.
    """
    try:
        from app.db import SessionLocal  # noqa: PLC0415
        now = datetime.now(UTC)

        with SessionLocal() as db:
            due_rows = db.execute(
                select(WebSource).where(
                    and_(
                        WebSource.sync_enabled.is_(True),
                        WebSource.next_sync_at.is_not(None),
                        WebSource.next_sync_at <= now,
                        WebSource.is_deleted.is_(False),
                    )
                ).limit(50)
            ).scalars().all()

        logger.info("[KNOWLEDGE_SYNC] 동기화 대상 %d개", len(due_rows))

        for row in due_rows:
            try:
                with SessionLocal() as db:
                    result = sync_web_source(str(row.id), db)
                logger.info(
                    "[KNOWLEDGE_SYNC] url=%s changed=%s chunks=%d",
                    row.base_url, result.changed, result.chunks_updated,
                )
            except Exception as exc:
                logger.warning("[KNOWLEDGE_SYNC] 개별 동기화 실패 id=%s: %s", row.id, exc)

    except Exception as exc:
        logger.exception("[KNOWLEDGE_SYNC] sync_all_due_web_sources 치명 오류: %s", exc)

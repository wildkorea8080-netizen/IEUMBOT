from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, aliased

from app.models import Document, DocumentVersion, IngestionJob, WebSource


def list_document_knowledge_rows(db: Session, *, organization_id: str):
    latest_version_sq = (
        select(
            DocumentVersion.document_id.label("document_id"),
            func.max(DocumentVersion.version_number).label("latest_version_number"),
        )
        .where(DocumentVersion.organization_id == organization_id)
        .group_by(DocumentVersion.document_id)
        .subquery()
    )
    latest_job_sq = (
        select(
            IngestionJob.document_id.label("document_id"),
            func.max(IngestionJob.created_at).label("latest_created_at"),
        )
        .where(
            IngestionJob.organization_id == organization_id,
            IngestionJob.document_id.is_not(None),
        )
        .group_by(IngestionJob.document_id)
        .subquery()
    )

    latest_version = aliased(DocumentVersion)
    latest_job = aliased(IngestionJob)
    stmt = (
        select(Document, latest_version, latest_job)
        .outerjoin(latest_version_sq, latest_version_sq.c.document_id == Document.id)
        .outerjoin(
            latest_version,
            and_(
                latest_version.document_id == Document.id,
                latest_version.version_number == latest_version_sq.c.latest_version_number,
            ),
        )
        .outerjoin(latest_job_sq, latest_job_sq.c.document_id == Document.id)
        .outerjoin(
            latest_job,
            and_(
                latest_job.document_id == Document.id,
                latest_job.created_at == latest_job_sq.c.latest_created_at,
            ),
        )
        .where(Document.organization_id == organization_id, Document.deleted_at.is_(None))
        .order_by(Document.updated_at.desc())
    )
    return list(db.execute(stmt).all())


def list_web_source_knowledge_rows(db: Session, *, organization_id: str):
    latest_job_sq = (
        select(
            IngestionJob.web_source_id.label("web_source_id"),
            func.max(IngestionJob.created_at).label("latest_created_at"),
        )
        .where(
            IngestionJob.organization_id == organization_id,
            IngestionJob.web_source_id.is_not(None),
        )
        .group_by(IngestionJob.web_source_id)
        .subquery()
    )

    latest_job = aliased(IngestionJob)
    stmt = (
        select(WebSource, latest_job)
        .outerjoin(latest_job_sq, latest_job_sq.c.web_source_id == WebSource.id)
        .outerjoin(
            latest_job,
            and_(
                latest_job.web_source_id == WebSource.id,
                latest_job.created_at == latest_job_sq.c.latest_created_at,
            ),
        )
        .where(WebSource.organization_id == organization_id, WebSource.is_deleted.is_(False))
        .order_by(WebSource.updated_at.desc())
    )
    return list(db.execute(stmt).all())


def get_document_knowledge_row(db: Session, *, organization_id: str, knowledge_id: str):
    rows = list_document_knowledge_rows(db, organization_id=organization_id)
    for row in rows:
        if str(row[0].id) == knowledge_id:
            return row
    return None


def get_web_source_knowledge_row(db: Session, *, organization_id: str, knowledge_id: str):
    rows = list_web_source_knowledge_rows(db, organization_id=organization_id)
    for row in rows:
        if str(row[0].id) == knowledge_id:
            return row
    return None

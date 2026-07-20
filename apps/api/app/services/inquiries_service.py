"""도입 문의(리드) 서비스 — 공개 접수 + 슈퍼관리자 조회/상태관리.

셀프 가입 대신 영업 기반 온보딩: 문의 접수 → 컨택 → 슈퍼관리자가 조직/계정 발급.
"""

import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import cache
from app.models.product_inquiries import ProductInquiry
from app.schemas.inquiries import (
    ProductInquiryCreateRequest,
    ProductInquiryItem,
    ProductInquiryListResponse,
)

logger = logging.getLogger(__name__)

_ALLOWED_STATUS = {"new", "contacted", "converted", "closed"}
# 스팸 방지: 동일 IP당 시간창 내 접수 상한.
_RATE_WINDOW_SECONDS = 3600
_RATE_MAX = 5


def _to_item(row: ProductInquiry) -> ProductInquiryItem:
    return ProductInquiryItem(
        id=str(row.id),
        organization_name=row.organization_name,
        contact_name=row.contact_name,
        email=row.email,
        phone=row.phone,
        interest=row.interest,
        message=row.message,
        status=row.status,
        handled_note=row.handled_note,
        source=row.source,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _enforce_rate_limit(client_ip: str | None) -> None:
    if not client_ip:
        return
    key = f"inquiry_rate:{client_ip}"
    try:
        count = int(cache.get(key) or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= _RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="TOO_MANY_REQUESTS"
        )
    cache.set(key, count + 1, _RATE_WINDOW_SECONDS)


def create_inquiry_service(
    db: Session,
    *,
    body: ProductInquiryCreateRequest,
    client_ip: str | None = None,
) -> ProductInquiry:
    _enforce_rate_limit(client_ip)
    row = ProductInquiry(
        organization_name=body.organization_name.strip()[:200],
        contact_name=body.contact_name.strip()[:120],
        email=body.email.strip().lower()[:255],
        phone=body.phone.strip()[:50],
        interest=(body.interest or None),
        message=(body.message or None),
        source=(body.source or None),
        status="new",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "[INQUIRY] new lead id=%s org=%s email_present=%s",
        row.id,
        row.organization_name,
        bool(row.email),
    )
    return row


def list_inquiries_service(
    db: Session,
    *,
    status_filter: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ProductInquiryListResponse:
    stmt = select(ProductInquiry).order_by(ProductInquiry.created_at.desc())
    count_stmt = select(func.count(ProductInquiry.id))
    if status_filter:
        stmt = stmt.where(ProductInquiry.status == status_filter)
        count_stmt = count_stmt.where(ProductInquiry.status == status_filter)
    total = int(db.execute(count_stmt).scalar_one())
    rows = db.execute(stmt.limit(max(1, min(limit, 500))).offset(max(0, offset))).scalars().all()
    return ProductInquiryListResponse(items=[_to_item(r) for r in rows], total=total)


def update_inquiry_service(
    db: Session,
    *,
    inquiry_id: str,
    status_value: str | None = None,
    handled_note: str | None = None,
) -> ProductInquiryItem:
    try:
        pk = uuid.UUID(inquiry_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="INQUIRY_NOT_FOUND"
        ) from exc
    row = db.execute(select(ProductInquiry).where(ProductInquiry.id == pk)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="INQUIRY_NOT_FOUND")
    if status_value is not None:
        if status_value not in _ALLOWED_STATUS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_STATUS"
            )
        row.status = status_value
    if handled_note is not None:
        row.handled_note = handled_note.strip() or None
    db.commit()
    db.refresh(row)
    return _to_item(row)

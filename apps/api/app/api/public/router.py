from app.db import get_db_session
from app.schemas.inquiries import ProductInquiryCreateRequest, ProductInquiryCreateResponse
from app.schemas.system_controls import PublicAnnouncementsResponse, PublicSystemStatusResponse
from app.services.inquiries_service import create_inquiry_service
from app.services.system_controls_service import (
    get_public_system_status_service,
    list_public_announcements_service,
)
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

router = APIRouter(tags=["public"])


@router.post(
    "/inquiries",
    response_model=ProductInquiryCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_product_inquiry(
    body: ProductInquiryCreateRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> ProductInquiryCreateResponse:
    """도입 문의 접수(공개). 슈퍼관리자가 컨택 후 계정을 발급한다."""
    client_ip = request.client.host if request.client else None
    row = create_inquiry_service(db, body=body, client_ip=client_ip)
    return ProductInquiryCreateResponse(id=str(row.id), status=row.status)


@router.get("/announcements", response_model=PublicAnnouncementsResponse)
def public_announcements(
    organization_id: str | None = Query(default=None, alias="organizationId"),
    db: Session = Depends(get_db_session),
) -> PublicAnnouncementsResponse:
    return list_public_announcements_service(db, organization_id=organization_id)


@router.get("/system-status", response_model=PublicSystemStatusResponse)
def public_system_status(
    db: Session = Depends(get_db_session),
) -> PublicSystemStatusResponse:
    return get_public_system_status_service(db)

"""기관 브랜딩(로고) 서비스 — 관리자 콘솔 좌측 상단 로고 조회/설정.

로고는 base64 data URL(권장) 또는 https 외부 URL로 저장한다.
파일 저장소가 없어도 되고 재배포에도 유지되도록 DB(organizations.logo_url)에 보관.
"""

import logging
import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organizations import Organization
from app.schemas.organization import OrganizationBrandingResponse

logger = logging.getLogger(__name__)

# data:image/(png|jpeg|jpg|gif|webp|svg+xml);base64,....
_DATA_URL_RE = re.compile(
    r"^data:image/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$",
    re.IGNORECASE,
)
# base64는 원본의 약 4/3배. 512KB 원본 ≈ 700KB 문자열. 여유롭게 1.5MB 상한.
_MAX_LOGO_CHARS = 1_500_000


def _load_org(db: Session, organization_id: str) -> Organization:
    org = db.execute(
        select(Organization).where(Organization.id == organization_id)
    ).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")
    return org


def _to_response(org: Organization) -> OrganizationBrandingResponse:
    return OrganizationBrandingResponse(
        organization_id=str(org.id),
        organization_name=org.name,
        logo_url=org.logo_url,
    )


def get_org_branding_service(db: Session, *, organization_id: str) -> OrganizationBrandingResponse:
    return _to_response(_load_org(db, organization_id))


def _validate_logo(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > _MAX_LOGO_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="LOGO_TOO_LARGE"
        )
    # data URL(권장) 또는 https 외부 URL만 허용. 그 외(javascript: 등)는 거부.
    if _DATA_URL_RE.match(cleaned):
        return cleaned
    if cleaned.startswith("https://"):
        return cleaned
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="LOGO_INVALID_FORMAT")


def update_org_branding_service(
    db: Session, *, organization_id: str, logo_url: str | None
) -> OrganizationBrandingResponse:
    org = _load_org(db, organization_id)
    org.logo_url = _validate_logo(logo_url)
    db.commit()
    db.refresh(org)
    logger.info(
        "[ORG_BRANDING] updated org=%s logo=%s", organization_id, "set" if org.logo_url else "cleared"
    )
    return _to_response(org)

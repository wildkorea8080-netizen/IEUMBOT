"""기관 브랜딩(로고) 라우트 — 관리자 콘솔 좌측 상단 로고 조회/설정.

GET  /api/admin/organization/branding  → 현재 기관 로고·이름 (사이드바 표시용)
PUT  /api/admin/organization/branding  → 로고 설정/제거 (기관관리자)

모두 호출자의 organization_id로 스코프.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.organization import (
    OrganizationBrandingResponse,
    OrganizationBrandingUpdateRequest,
)
from app.services.admin.organization_service import (
    get_org_branding_service,
    update_org_branding_service,
)
from app.services.admin.scope_service import require_institution_organization_id

router = APIRouter(prefix="/organization", tags=["admin-organization"])


@router.get("/branding", response_model=OrganizationBrandingResponse)
def get_organization_branding(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> OrganizationBrandingResponse:
    organization_id = require_institution_organization_id(principal)
    return get_org_branding_service(db, organization_id=organization_id)


@router.put("/branding", response_model=OrganizationBrandingResponse)
def update_organization_branding(
    body: OrganizationBrandingUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> OrganizationBrandingResponse:
    organization_id = require_institution_organization_id(principal)
    return update_org_branding_service(
        db, organization_id=organization_id, logo_url=body.logo_url
    )

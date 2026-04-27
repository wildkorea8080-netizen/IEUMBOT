from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.super_admin_api_configs import AdminApiUsageSummaryResponse
from app.services.admin.scope_service import require_institution_organization_id
from app.services.super_admin.api_configs_service import get_admin_api_usage_summary_service

router = APIRouter(tags=["admin-api-usage"])


@router.get("/api-usage/summary", response_model=AdminApiUsageSummaryResponse)
def admin_api_usage_summary(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminApiUsageSummaryResponse:
    organization_id = require_institution_organization_id(principal)
    return get_admin_api_usage_summary_service(db, organization_id=organization_id)


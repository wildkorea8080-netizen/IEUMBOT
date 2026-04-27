from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.billing import AdminBillingUsageResponse
from app.services.billing_service import get_admin_billing_usage_service

router = APIRouter(tags=["admin-billing"])


@router.get("/billing/usage", response_model=AdminBillingUsageResponse)
def admin_billing_usage(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminBillingUsageResponse:
    return get_admin_billing_usage_service(db, principal=principal)


@router.get("/billing", response_model=AdminBillingUsageResponse)
def admin_billing(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminBillingUsageResponse:
    return get_admin_billing_usage_service(db, principal=principal)

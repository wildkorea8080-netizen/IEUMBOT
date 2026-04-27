from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.install_guide import AdminInstallGuideResponse
from app.services.admin.install_guide_service import get_install_guide_service

router = APIRouter(tags=["admin-install-guide"])


@router.get("/install-guide", response_model=AdminInstallGuideResponse)
def admin_get_install_guide(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminInstallGuideResponse:
    return get_install_guide_service(db, principal=principal)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_super_admin_auth
from app.db import get_db_session
from app.schemas.super_admin_operations import (
    SuperAdminBlueprintApplyRequest,
    SuperAdminBlueprintApplyResponse,
    SuperAdminBlueprintCreateRequest,
    SuperAdminBlueprintListResponse,
    SuperAdminBlueprintResponse,
)
from app.services.super_admin.operations_service import (
    apply_blueprint_service,
    create_blueprint_service,
    list_blueprints_service,
)

router = APIRouter(tags=["super-admin"])


@router.get("/blueprints", response_model=SuperAdminBlueprintListResponse)
def super_admin_list_blueprints(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminBlueprintListResponse:
    return list_blueprints_service(db, principal=principal)


@router.post("/blueprints", response_model=SuperAdminBlueprintResponse)
def super_admin_create_blueprint(
    body: SuperAdminBlueprintCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminBlueprintResponse:
    return create_blueprint_service(db, principal=principal, body=body)


@router.post("/blueprints/{blueprint_id}/apply", response_model=SuperAdminBlueprintApplyResponse)
def super_admin_apply_blueprint(
    blueprint_id: str,
    body: SuperAdminBlueprintApplyRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminBlueprintApplyResponse:
    return apply_blueprint_service(db, principal=principal, blueprint_id=blueprint_id, body=body)

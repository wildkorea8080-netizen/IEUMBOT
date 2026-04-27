from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.admin_users import (
    AdminUserCreateRequest,
    AdminUserResponse,
    AdminUsersListResponse,
    AdminUserUpdateRequest,
)
from app.services.admin.users_service import (
    create_admin_user_service,
    delete_admin_user_service,
    list_admin_users_service,
    update_admin_user_service,
)

router = APIRouter(tags=["admin-users"])


@router.get("/users", response_model=AdminUsersListResponse)
def admin_list_users(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminUsersListResponse:
    return list_admin_users_service(db, principal=principal)


@router.post("/users", response_model=AdminUserResponse)
def admin_create_user(
    body: AdminUserCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminUserResponse:
    return create_admin_user_service(db, principal=principal, body=body)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def admin_patch_user(
    user_id: str,
    body: AdminUserUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminUserResponse:
    return update_admin_user_service(db, principal=principal, user_id=user_id, body=body)


@router.delete("/users/{user_id}", status_code=204)
def admin_delete_user(
    user_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
):
    return delete_admin_user_service(db, principal=principal, user_id=user_id)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.security import (
    AdminSecurityEventDetailResponse,
    AdminSecuritySummaryResponse,
)
from app.services.admin.security_service import (
    get_security_event_detail_service,
    get_security_summary_service,
)

router = APIRouter(tags=["admin-security"])


@router.get("/security/summary", response_model=AdminSecuritySummaryResponse)
def admin_security_summary(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminSecuritySummaryResponse:
    return get_security_summary_service(db, principal=principal)


# /security/events 목록은 security_events_router가 담당한다.
# 여기에도 같은 경로가 있어 등록 순서에 따라 화면이 기대하지 않는 응답이 나갔고,
# 보안센터가 통째로 빈 화면이었다(2026-08-12). 이를 쓰던 프런트는 죽은 코드라
# 함께 지웠으므로 중복 경로도 남기지 않는다.


@router.get("/security/events/{event_id}", response_model=AdminSecurityEventDetailResponse)
def admin_security_event_detail(
    event_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminSecurityEventDetailResponse:
    return get_security_event_detail_service(db, principal=principal, event_id=event_id)

"""로그인(접속) 이벤트를 접속기록(감사로그)에 남기는 서비스.

기관관리자·기관사용자가 관리자 콘솔에 로그인하면 org-scoped 감사로그에 기록되어
`/admin/audit` 화면의 "로그인" 필터로 조회된다.

best-effort — 기록 실패가 로그인 자체를 막지 않는다(감사로그 오류 ≠ 인증 실패).
"""

import logging

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.client_ip import get_client_ip
from app.models.admins import Admin
from app.repositories.logs.audit_log_repository import create_audit_log

logger = logging.getLogger(__name__)

_USER_AGENT_MAX_LENGTH = 500


def record_admin_login(db: Session, *, admin: Admin, role: str, request: Request) -> None:
    """기관 계정의 로그인 성공을 접속기록에 남긴다.

    - 슈퍼관리자 등 기관 미소속 계정은 org-scoped 접속기록 대상이 아니므로 건너뛴다.
    - 기록/커밋 실패는 삼켜서(rollback) 로그인 흐름을 방해하지 않는다.
    """
    if admin.organization_id is None:
        return

    user_agent = request.headers.get("user-agent")
    if user_agent:
        user_agent = user_agent[:_USER_AGENT_MAX_LENGTH]

    try:
        create_audit_log(
            db,
            organization_id=str(admin.organization_id),
            admin_id=str(admin.id),
            action="auth.login",
            target_type="admin",
            target_id=str(admin.id),
            result="success",
            request_id=None,
            ip_address=get_client_ip(request),
            user_agent=(user_agent or None),
            metadata_json={"role": role, "email": admin.email},
        )
        db.commit()
    except Exception:  # noqa: BLE001
        logger.warning("[AUDIT] login record failed admin_id=%s", admin.id, exc_info=True)
        db.rollback()

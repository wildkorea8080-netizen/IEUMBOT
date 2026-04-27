from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def create_audit_log(
    db: Session,
    *,
    organization_id: str,
    admin_id: str | None,
    action: str,
    target_type: str | None,
    target_id: str | None,
    result: str,
    request_id: str | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata_json: dict[str, Any] | None,
) -> AuditLog:
    row = AuditLog(
        organization_id=organization_id,
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result=result,
        request_id=request_id,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata_json=metadata_json or {},
    )
    db.add(row)
    db.flush()
    return row

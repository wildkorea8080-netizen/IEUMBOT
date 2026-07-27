"""관리자 콘솔 IP 접근제어 — 허용 IP/CIDR 조회·설정·강제.

- 허용목록이 비어 있으면(None/[]) 제한 없음(모든 IP 허용).
- 값이 있으면 로그인·관리자 API가 목록 밖 IP를 403(IP_NOT_ALLOWED)으로 차단.
- 슈퍼관리자는 우회(강제 대상 아님).
- 자기 잠금 방지: 설정 저장 시 '현재 접속 IP'가 새 목록에 포함돼야 한다.
"""

import ipaddress
import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organizations import Organization

logger = logging.getLogger(__name__)

MAX_IP_ENTRIES = 50


def _parse_entry(entry: str) -> ipaddress._BaseNetwork | None:
    """IP 또는 CIDR 문자열 → 네트워크 객체. 유효하지 않으면 None."""
    cleaned = (entry or "").strip()
    if not cleaned:
        return None
    try:
        # 단일 IP도 /32(/128) 네트워크로 통일해 비교.
        return ipaddress.ip_network(cleaned, strict=False)
    except ValueError:
        return None


def normalize_entries(entries: object) -> list[str]:
    """입력 목록을 검증·정규화. 유효하지 않은 항목이 있으면 422."""
    if not isinstance(entries, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="IP_LIST_INVALID"
        )
    result: list[str] = []
    seen: set[str] = set()
    for raw in entries[:MAX_IP_ENTRIES]:
        network = _parse_entry(str(raw))
        if network is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="IP_ENTRY_INVALID",
            )
        text = str(network) if "/" in str(raw) else str(network.network_address)
        if text not in seen:
            seen.add(text)
            result.append(text)
    return result


def ip_matches(allowed: list[str] | None, client_ip: str | None) -> bool:
    """client_ip가 허용목록에 속하는지. 목록이 비면 항상 True(제한 없음)."""
    if not allowed:
        return True
    if not client_ip:
        return False
    try:
        addr = ipaddress.ip_address(client_ip.strip())
    except ValueError:
        return False
    for entry in allowed:
        network = _parse_entry(entry)
        if network is not None and addr in network:
            return True
    return False


def get_org_allowed_ips(db: Session, organization_id: str) -> list[str]:
    org = db.execute(
        select(Organization).where(Organization.id == organization_id)
    ).scalar_one_or_none()
    if org is None:
        return []
    return list(org.allowed_admin_ips or [])


def enforce_org_ip_access(
    db: Session, *, organization_id: str | None, client_ip: str | None
) -> None:
    """기관 허용목록 기준으로 접근 차단. 목록이 비면 통과. 위반 시 403."""
    if not organization_id:
        return
    allowed = get_org_allowed_ips(db, organization_id)
    if not allowed:
        return
    if not ip_matches(allowed, client_ip):
        logger.warning(
            "[IP_ACCESS] blocked org=%s ip=%s", organization_id, client_ip or "unknown"
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="IP_NOT_ALLOWED")


def update_org_allowed_ips(
    db: Session, *, organization_id: str, entries: object, current_ip: str | None
) -> list[str]:
    """허용목록 저장. 목록이 비어있지 않으면 현재 IP가 포함돼야 한다(자기 잠금 방지)."""
    org = db.execute(
        select(Organization).where(Organization.id == organization_id)
    ).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    normalized = normalize_entries(entries)
    if normalized and not ip_matches(normalized, current_ip):
        # 현재 IP가 빠지면 저장 즉시 본인이 잠기므로 거부.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CURRENT_IP_MUST_BE_INCLUDED",
        )

    org.allowed_admin_ips = normalized or None
    db.commit()
    logger.info(
        "[IP_ACCESS] updated org=%s entries=%s by_ip=%s",
        organization_id,
        len(normalized),
        current_ip or "unknown",
    )
    return normalized

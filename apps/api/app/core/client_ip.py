"""클라이언트 실제 IP 판별 — 프록시(Coolify/Traefik) 뒤 환경 대응.

`request.client.host`는 프록시 뒤에서는 프록시 IP라 IP 접근제어에 쓸 수 없다.
X-Forwarded-For는 "클라이언트, 프록시1, 프록시2, ..." 순으로 각 홉이 추가한다.
신뢰 프록시가 N개면 실제 클라이언트는 오른쪽에서 N번째 항목(프록시가 붙인 값)이다.
클라이언트가 XFF를 위조해도 왼쪽에만 들어가므로, 오른쪽 기준이 위조에 안전하다.
"""

from app.core.config import settings
from fastapi import Request


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            depth = max(1, int(getattr(settings, "trusted_proxy_count", 1) or 1))
            # 신뢰 프록시가 붙인 위치(오른쪽에서 depth번째)를 실제 클라이언트로 본다.
            index = len(parts) - depth
            return parts[index] if 0 <= index < len(parts) else parts[0]
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    return request.client.host if request.client else None

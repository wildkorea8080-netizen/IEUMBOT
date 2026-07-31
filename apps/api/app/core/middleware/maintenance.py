from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core import cache
from app.core.security import decode_access_token
from app.db import SessionLocal
from app.repositories.system_controls_repository import get_current_maintenance

EXEMPT_PREFIXES = (
    "/api/public",
    "/api/health",
    "/api/admin/auth",
    "/api/docs",
    "/api/openapi.json",
)

# 점검 상태는 관리자가 가끔 바꾸는 값인데 이 미들웨어는 모든 요청을 거친다.
# 요청마다 DB를 때리면 (1) 커넥션 풀을 소모하고 (2) 풀이 마르면 체크아웃 대기가
# 그대로 이벤트 루프 정지로 이어진다. in-memory 캐시로 요청당 DB 조회를 없앤다.
# (cache.get/set은 Redis=블로킹 네트워크라 이벤트 루프에서 쓰면 안 된다 → get_local 사용)
_MAINTENANCE_CACHE_KEY = "middleware:maintenance:current"
_MAINTENANCE_CACHE_TTL_SECONDS = 10
_NO_MAINTENANCE = "__none__"


def _fetch_maintenance_snapshot() -> dict | str:
    """DB에서 현재 점검 상태를 읽어 캐시 가능한 스냅샷으로 변환.

    반드시 스레드풀에서 호출할 것 — 동기 DB I/O다.
    ORM 객체 대신 dict를 반환해 세션 종료 후 접근(detached) 위험도 없앤다.
    """
    db = SessionLocal()
    try:
        maintenance = get_current_maintenance(db)
        if maintenance is None:
            return _NO_MAINTENANCE
        return {
            "mode": maintenance.mode,
            "message": maintenance.message,
            "allowed_roles": list(maintenance.allowed_roles or []),
            "allowed_paths": [str(item) for item in (maintenance.allowed_paths or [])],
        }
    finally:
        db.close()


class MaintenanceModeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if path == "/api" or any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
            return await call_next(request)

        if self._is_super_admin_bypass(request):
            return await call_next(request)

        snapshot = cache.get_local(_MAINTENANCE_CACHE_KEY)
        if snapshot is None:
            # 캐시 미스일 때만 DB — 그마저도 스레드풀로 보내 이벤트 루프를 비워 둔다.
            snapshot = await run_in_threadpool(_fetch_maintenance_snapshot)
            cache.set_local(_MAINTENANCE_CACHE_KEY, snapshot, _MAINTENANCE_CACHE_TTL_SECONDS)

        if snapshot == _NO_MAINTENANCE:
            return await call_next(request)

        if self._is_allowed_by_role(request, snapshot["allowed_roles"]):
            return await call_next(request)

        message = snapshot["message"]
        if snapshot["mode"] == "block_all":
            return self._blocked_response(message)
        if snapshot["mode"] == "read_only" and request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            return self._blocked_response(message)
        if snapshot["mode"] == "partial":
            allowed_paths = [item.strip() for item in snapshot["allowed_paths"] if item.strip()]
            if not any(path.startswith(prefix) for prefix in allowed_paths):
                return self._blocked_response(message)

        return await call_next(request)

    def _is_super_admin_bypass(self, request: Request) -> bool:
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            return False
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            return False
        try:
            payload = decode_access_token(token)
        except Exception:
            return False
        return payload.get("role") == "super_admin" and not bool(payload.get("impersonation"))

    def _is_allowed_by_role(self, request: Request, allowed_roles: list[str] | None) -> bool:
        if not allowed_roles:
            return False
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            return False
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            return False
        try:
            payload = decode_access_token(token)
        except Exception:
            return False
        return str(payload.get("role")) in {str(role) for role in allowed_roles}

    def _blocked_response(self, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": message or "System maintenance is in progress.",
                "error": {"code": "SYSTEM_MAINTENANCE_ACTIVE", "message": message or "System maintenance is in progress."},
            },
        )

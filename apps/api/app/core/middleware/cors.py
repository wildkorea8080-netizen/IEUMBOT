"""
경로별 CORS 분기 미들웨어.

- /api/widget/* /api/chat/* → allow_origins=* (자격증명 불필요, 어느 기관 홈페이지에서나 로드 가능)
- 그 외 (관리자 등)     → settings.api_allowed_origins 목록만 허용 + 세션 쿠키 허용

BaseHTTPMiddleware 대신 순수 ASGI 미들웨어로 작성해 SSE 스트리밍이 끊기지 않는다.
"""

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_WIDGET_PREFIXES = ("/api/widget/", "/api/chat/")
_WIDGET_METHODS = "GET, POST, OPTIONS"
_ADMIN_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
_ALLOWED_HEADERS = (
    "Authorization, Content-Type, X-Request-Id, X-Session-Token, "
    "Accept, Accept-Language, Origin, User-Agent"
)
_EXPOSE_HEADERS = "X-Request-Id"
_MAX_AGE = "600"


class SplitCORSMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    @staticmethod
    def _is_widget(path: str) -> bool:
        return any(path.startswith(p) for p in _WIDGET_PREFIXES)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        method = scope.get("method", "")
        path = scope.get("path", "")
        is_widget = self._is_widget(path)

        if not origin:
            await self.app(scope, receive, send)
            return

        # ── Preflight ────────────────────────────────────────────────
        if method == "OPTIONS":
            if is_widget:
                resp = PlainTextResponse(
                    "",
                    status_code=204,
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": _WIDGET_METHODS,
                        "Access-Control-Allow-Headers": _ALLOWED_HEADERS,
                        "Access-Control-Max-Age": _MAX_AGE,
                    },
                )
            else:
                from app.core.config import settings

                if origin in settings.api_allowed_origins:
                    resp = PlainTextResponse(
                        "",
                        status_code=204,
                        headers={
                            "Access-Control-Allow-Origin": origin,
                            "Access-Control-Allow-Credentials": "true",
                            "Access-Control-Allow-Methods": _ADMIN_METHODS,
                            "Access-Control-Allow-Headers": _ALLOWED_HEADERS,
                            "Access-Control-Max-Age": _MAX_AGE,
                            "Vary": "Origin",
                        },
                    )
                else:
                    resp = PlainTextResponse("Disallowed CORS origin", status_code=400)
            await resp(scope, receive, send)
            return

        # ── 실제 요청 — 응답 헤더에 CORS 주입 ────────────────────────
        if is_widget:
            cors_headers: dict[str, str] = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Expose-Headers": _EXPOSE_HEADERS,
            }
        else:
            from app.core.config import settings

            if origin in settings.api_allowed_origins:
                cors_headers = {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Expose-Headers": _EXPOSE_HEADERS,
                    "Vary": "Origin",
                }
            else:
                cors_headers = {}

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start" and cors_headers:
                mutable = MutableHeaders(scope=message)
                for k, v in cors_headers.items():
                    mutable.append(k, v)
            await send(message)

        await self.app(scope, receive, send_with_cors)

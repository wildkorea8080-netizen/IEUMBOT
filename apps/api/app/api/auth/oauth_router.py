"""SNS OAuth 공개 라우트 (셀프서비스 가입/로그인).

흐름:
  GET /api/auth/oauth/providers            → 활성 제공사 목록(프론트 버튼 노출용)
  GET /api/auth/oauth/{provider}/start     → state 발급(캐시) 후 제공사 동의화면으로 리다이렉트
  GET /api/auth/oauth/{provider}/callback  → code 교환 → 온보딩 → 토큰 발급 →
                                             프론트(oauth_web_success_url)로 #token=... 전달

state(CSRF 방지)는 쿠키 대신 공유 캐시에 저장 → 콜백이 api 도메인에 직접 와도
도메인 쿠키 문제 없이 검증 가능(다중 인스턴스는 Redis 권장).
"""

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core import cache
from app.core.config import settings
from app.core.security import create_access_token
from app.db import get_db_session
from app.services.auth.oauth_onboarding_service import (
    OnboardingError,
    find_or_create_admin_from_oauth,
)
from app.services.auth.oauth_service import (
    OAuthError,
    build_authorize_url,
    enabled_providers,
    exchange_code_for_userinfo,
    is_enabled,
    make_state,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

_STATE_PREFIX = "oauth_state:"
_STATE_TTL_SECONDS = 600


def _web_redirect(fragment: str) -> RedirectResponse:
    """프론트 복귀 URL로 리다이렉트. 토큰·에러는 URL fragment(#)로 전달(서버 로그·referrer 노출 방지)."""
    target = settings.oauth_web_success_url or "/"
    return RedirectResponse(f"{target}#{fragment}", status_code=302)


@router.get("/providers")
def oauth_providers() -> dict:
    """client_id가 설정된 제공사만 반환. 미설정이면 [] → 프론트가 버튼을 숨김."""
    return {"providers": enabled_providers()}


@router.get("/{provider}/start")
def oauth_start(provider: str) -> RedirectResponse:
    if not is_enabled(provider):
        return _web_redirect("error=provider_disabled")
    state = make_state()
    cache.set(f"{_STATE_PREFIX}{state}", provider, _STATE_TTL_SECONDS)
    return RedirectResponse(build_authorize_url(provider, state=state), status_code=307)


@router.get("/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db_session),
) -> RedirectResponse:
    if not is_enabled(provider):
        return _web_redirect("error=provider_disabled")
    if error or not code or not state:
        return _web_redirect("error=oauth_denied")

    # state(CSRF) 검증 — 캐시에 저장된 provider와 일치해야 함. 1회용.
    cached = cache.get(f"{_STATE_PREFIX}{state}")
    if cached != provider:
        return _web_redirect("error=state_mismatch")
    cache.delete(f"{_STATE_PREFIX}{state}")

    try:
        info = exchange_code_for_userinfo(provider, code=code, state=state)
        admin = find_or_create_admin_from_oauth(db, info)
    except OnboardingError as exc:
        logger.warning("[OAUTH] onboarding blocked provider=%s reason=%s", provider, exc)
        return _web_redirect(f"error={exc}")
    except OAuthError as exc:
        logger.warning("[OAUTH] callback failed provider=%s: %s", provider, exc)
        return _web_redirect("error=oauth_error")
    except Exception:  # noqa: BLE001
        logger.exception("[OAUTH] callback unexpected error provider=%s", provider)
        db.rollback()
        return _web_redirect("error=server_error")

    token, expires_at = create_access_token(
        admin_id=str(admin.id),
        organization_id=(str(admin.organization_id) if admin.organization_id else None),
        role=admin.role,
    )
    fragment = urlencode({"token": token, "expiresAt": expires_at.isoformat()})
    return _web_redirect(fragment)

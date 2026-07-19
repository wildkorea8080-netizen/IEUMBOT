"""SNS OAuth (Google / Kakao / Naver) — 셀프서비스 가입·로그인용 제공사 추상화.

흐름: authorize URL 생성 → 사용자가 제공사에서 동의 → code 콜백 → code 교환 →
사용자정보(email·subject·name) 획득. 온보딩(계정/조직/체험 생성)은 별도 서비스에서 처리.

원칙:
- 외부 HTTP는 web_fetcher.get_client()(httpx 싱글톤)만 사용(CLAUDE.md 규칙, urllib 금지).
- client_id 미설정 제공사는 enabled_providers()에서 제외 → 프론트가 버튼을 숨김.
- Secret은 env(oauth_*_client_secret)로만. 저장소 커밋 금지.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

from app.core.config import settings
from app.services.web_fetcher import get_client

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = ("google", "kakao", "naver")

_AUTHORIZE = {
    "google": "https://accounts.google.com/o/oauth2/v2/auth",
    "kakao": "https://kauth.kakao.com/oauth/authorize",
    "naver": "https://nid.naver.com/oauth2.0/authorize",
}
_TOKEN = {
    "google": "https://oauth2.googleapis.com/token",
    "kakao": "https://kauth.kakao.com/oauth/token",
    "naver": "https://nid.naver.com/oauth2.0/token",
}
_USERINFO = {
    "google": "https://openidconnect.googleapis.com/v1/userinfo",
    "kakao": "https://kapi.kakao.com/v2/user/me",
    "naver": "https://openapi.naver.com/v1/nid/me",
}
# 제공사별 요청 scope (네이버는 앱 설정의 제공정보를 사용하므로 scope 파라미터 불필요)
_SCOPE = {
    "google": "openid email profile",
    "kakao": "account_email profile_nickname",
    "naver": "",
}


class OAuthError(Exception):
    """OAuth 흐름 오류(설정 누락·토큰 교환 실패·사용자정보 부족 등)."""


@dataclass
class OAuthUserInfo:
    provider: str
    subject: str  # 제공사 고유 사용자 id (이메일이 바뀌어도 안정적인 식별자)
    email: str
    name: str


def _creds(provider: str) -> tuple[str, str]:
    cid = (getattr(settings, f"oauth_{provider}_client_id", "") or "").strip()
    secret = (getattr(settings, f"oauth_{provider}_client_secret", "") or "").strip()
    return cid, secret


def enabled_providers() -> list[str]:
    """client_id가 설정된 제공사 목록(프론트 버튼 노출 기준)."""
    return [p for p in SUPPORTED_PROVIDERS if _creds(p)[0]]


def is_enabled(provider: str) -> bool:
    return provider in SUPPORTED_PROVIDERS and bool(_creds(provider)[0])


def make_state() -> str:
    """CSRF 방지용 state 토큰."""
    return secrets.token_urlsafe(24)


def callback_redirect_uri(provider: str) -> str:
    """제공사 콘솔에 등록한 redirect_uri와 정확히 일치해야 함."""
    base = (settings.oauth_api_base_url or "").rstrip("/")
    return f"{base}/auth/oauth/{provider}/callback"


def build_authorize_url(provider: str, *, state: str) -> str:
    if not is_enabled(provider):
        raise OAuthError(f"provider not configured: {provider}")
    cid, _ = _creds(provider)
    params = {
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": callback_redirect_uri(provider),
        "state": state,
    }
    scope = _SCOPE.get(provider) or ""
    if scope:
        params["scope"] = scope
    return f"{_AUTHORIZE[provider]}?{urlencode(params)}"


def _exchange_token(provider: str, code: str, state: str) -> str:
    cid, secret = _creds(provider)
    data = {
        "grant_type": "authorization_code",
        "client_id": cid,
        "redirect_uri": callback_redirect_uri(provider),
        "code": code,
    }
    if secret:
        data["client_secret"] = secret
    if provider == "naver":
        data["state"] = state
    resp = get_client().post(
        _TOKEN[provider], data=data, headers={"Accept": "application/json"}, timeout=15
    )
    resp.raise_for_status()
    payload = resp.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise OAuthError(f"{provider}: token response missing access_token")
    return str(access_token)


def _fetch_userinfo(provider: str, access_token: str) -> OAuthUserInfo:
    resp = get_client().get(
        _USERINFO[provider],
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if provider == "google":
        subject = str(data.get("sub") or "")
        email = str(data.get("email") or "").strip().lower()
        name = str(data.get("name") or "").strip()
    elif provider == "kakao":
        subject = str(data.get("id") or "")
        account = data.get("kakao_account") or {}
        email = str(account.get("email") or "").strip().lower()
        profile = account.get("profile") or {}
        name = str(profile.get("nickname") or "").strip()
    elif provider == "naver":
        r = data.get("response") or {}
        subject = str(r.get("id") or "")
        email = str(r.get("email") or "").strip().lower()
        name = str(r.get("name") or r.get("nickname") or "").strip()
    else:
        raise OAuthError(f"unsupported provider: {provider}")

    if not subject:
        raise OAuthError(f"{provider}: userinfo missing stable user id")
    if not name:
        name = email.split("@")[0] if email else "사용자"
    return OAuthUserInfo(provider=provider, subject=subject, email=email, name=name)


def exchange_code_for_userinfo(provider: str, *, code: str, state: str) -> OAuthUserInfo:
    """콜백에서 받은 code → 제공사 사용자정보. 실패 시 OAuthError."""
    if provider not in SUPPORTED_PROVIDERS:
        raise OAuthError(f"unsupported provider: {provider}")
    if not is_enabled(provider):
        raise OAuthError(f"provider not configured: {provider}")
    access_token = _exchange_token(provider, code, state)
    info = _fetch_userinfo(provider, access_token)
    logger.info(
        "[OAUTH] userinfo fetched provider=%s subject=%s email_present=%s",
        provider, info.subject, bool(info.email),
    )
    return info

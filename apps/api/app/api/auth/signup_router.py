"""이메일/비밀번호 셀프 회원가입 공개 라우트.

  GET  /api/auth/signup/config        → 가입 기능 활성 여부(프론트 탭 노출 판단)
  POST /api/auth/signup               → 가입(조직·관리자·무료체험 생성 + 인증메일)
  POST /api/auth/verify-email         → 인증 토큰 검증
  POST /api/auth/resend-verification  → 인증메일 재발송

SIGNUP_ENABLED=false(기본)면 config는 enabled=false, 나머지는 403.
"""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db_session
from app.schemas.signup import (
    ResendVerificationRequest,
    SignupConfigResponse,
    SignupRequest,
    SignupResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.services.auth.signup_service import (
    resend_verification_service,
    signup_service,
    verify_email_service,
)
from app.services.email_service import is_configured as email_is_configured

router = APIRouter(tags=["auth-signup"])


@router.get("/signup/config", response_model=SignupConfigResponse)
def signup_config() -> SignupConfigResponse:
    return SignupConfigResponse(
        enabled=bool(settings.signup_enabled),
        email_delivery_ready=email_is_configured(),
    )


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> SignupResponse:
    client_ip = request.client.host if request.client else None
    admin, sent = signup_service(
        db,
        email=body.email,
        password=body.password,
        terms_agreed=body.terms_agreed,
        client_ip=client_ip,
    )
    return SignupResponse(email=admin.email, verification_sent=sent)


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(
    body: VerifyEmailRequest,
    db: Session = Depends(get_db_session),
) -> VerifyEmailResponse:
    admin = verify_email_service(db, token=body.token)
    return VerifyEmailResponse(email=admin.email, verified=True)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(
    body: ResendVerificationRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> dict:
    client_ip = request.client.host if request.client else None
    resend_verification_service(db, email=body.email, client_ip=client_ip)
    # 계정 존재 여부를 노출하지 않도록 항상 동일 응답
    return {"accepted": True}

from pydantic import Field

from app.schemas import ApiSchema


class SignupConfigResponse(ApiSchema):
    """프론트가 회원가입 탭 노출 여부를 판단하기 위한 공개 설정."""

    enabled: bool
    email_delivery_ready: bool


class SignupRequest(ApiSchema):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    terms_agreed: bool = False


class SignupResponse(ApiSchema):
    email: str
    verification_sent: bool


class VerifyEmailRequest(ApiSchema):
    token: str = Field(min_length=8, max_length=500)


class VerifyEmailResponse(ApiSchema):
    email: str
    verified: bool


class ResendVerificationRequest(ApiSchema):
    email: str = Field(min_length=3, max_length=255)

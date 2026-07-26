from pydantic import Field

from app.schemas import ApiSchema


class PasswordPolicyResponse(ApiSchema):
    """현재 적용 중인 전역 비밀번호 정책. 비밀번호 입력 폼이 힌트·검증에 사용."""

    min_length: int
    require_uppercase: bool
    require_lowercase: bool
    require_digit: bool
    require_symbol: bool


class PasswordPolicyUpdateRequest(ApiSchema):
    min_length: int = Field(ge=8, le=64)
    require_uppercase: bool
    require_lowercase: bool
    require_digit: bool
    require_symbol: bool

from pydantic import Field

from app.schemas import ApiSchema


class OrganizationBrandingResponse(ApiSchema):
    """관리자 콘솔 브랜딩(기관명 + 로고). 사이드바가 이 값으로 로고를 표시한다."""

    organization_id: str
    organization_name: str
    # base64 data URL 또는 외부 URL. None이면 기본 이음봇 마크 표시.
    logo_url: str | None = None


class OrganizationBrandingUpdateRequest(ApiSchema):
    # 빈 문자열/None이면 로고 제거(기본 마크로 복귀).
    logo_url: str | None = Field(default=None, max_length=2_000_000)

from pydantic import Field

from app.schemas import ApiSchema


class OrganizationBrandingResponse(ApiSchema):
    """관리자 콘솔 브랜딩(기관명 + 로고). 사이드바가 이 값으로 로고를 표시한다."""

    organization_id: str
    organization_name: str
    # 기관 코드(slug). 특정 기관 전용 기능(예: 서울노동상담 수집)의 노출 제어에 사용.
    organization_slug: str
    # base64 data URL 또는 외부 URL. None이면 기본 이음봇 마크 표시.
    logo_url: str | None = None


class OrganizationBrandingUpdateRequest(ApiSchema):
    # 빈 문자열/None이면 로고 제거(기본 마크로 복귀).
    logo_url: str | None = Field(default=None, max_length=2_000_000)


class OrganizationIpAccessResponse(ApiSchema):
    """관리자 콘솔 IP 접근제어 상태. currentIp는 호출자의 현재 접속 IP(설정 UI 안내용)."""

    allowed_ips: list[str] = Field(default_factory=list)
    # 허용목록이 비어 있으면 제한 없음(모든 IP 허용).
    enabled: bool = False
    current_ip: str | None = None


class OrganizationIpAccessUpdateRequest(ApiSchema):
    allowed_ips: list[str] = Field(default_factory=list, max_length=50)

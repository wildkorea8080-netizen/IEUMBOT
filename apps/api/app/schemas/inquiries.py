from datetime import datetime

from pydantic import Field, field_validator

from app.schemas import ApiSchema


class ProductInquiryCreateRequest(ApiSchema):
    organization_name: str = Field(min_length=1, max_length=200)
    contact_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    phone: str = Field(min_length=1, max_length=50)
    interest: str | None = Field(default=None, max_length=120)
    message: str | None = Field(default=None, max_length=4000)
    source: str | None = Field(default=None, max_length=60)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        local, _, domain = cleaned.partition("@")
        if not local or "." not in domain:
            raise ValueError("INVALID_EMAIL")
        return cleaned


class ProductInquiryCreateResponse(ApiSchema):
    id: str
    status: str


class ProductInquiryItem(ApiSchema):
    id: str
    organization_name: str
    contact_name: str
    email: str
    phone: str
    interest: str | None
    message: str | None
    status: str
    handled_note: str | None
    source: str | None
    created_at: datetime
    updated_at: datetime


class ProductInquiryListResponse(ApiSchema):
    items: list[ProductInquiryItem]
    total: int


class ProductInquiryUpdateRequest(ApiSchema):
    status: str | None = Field(default=None)
    handled_note: str | None = Field(default=None, max_length=4000)

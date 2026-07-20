from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class ProductInquiry(UUIDPrimaryKeyMixin, Base):
    """도입 문의(리드) — 공개 폼으로 담당자 연락처를 받아 슈퍼관리자가 컨택·계정 발급.

    셀프 가입 대신 영업 기반 온보딩: 문의 접수 → 컨택 → 슈퍼관리자가 조직/계정 생성.
    """

    __tablename__ = "product_inquiries"
    __table_args__ = (Index("ix_product_inquiries_status_created", "status", "created_at"),)

    organization_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    interest: Mapped[str | None] = mapped_column(String(120), nullable=True)  # 관심 플랜/항목
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # new(신규) | contacted(컨택완료) | converted(계정발급) | closed(종료)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new", server_default="new"
    )
    handled_note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 처리 메모
    source: Mapped[str | None] = mapped_column(
        String(60), nullable=True
    )  # 유입 경로(login/landing 등)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

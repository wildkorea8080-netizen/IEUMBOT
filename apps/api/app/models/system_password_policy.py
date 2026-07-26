from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class SystemPasswordPolicy(UUIDPrimaryKeyMixin, Base):
    """전역 비밀번호 정책(단일 행). 슈퍼관리자가 설정하며 모든 비밀번호 검증에 적용.

    행이 없으면 서비스가 기본값(현재 규칙: 8자 + 대문자·숫자·특수)을 사용한다.
    """

    __tablename__ = "system_password_policy"

    min_length: Mapped[int] = mapped_column(Integer, nullable=False, default=8, server_default="8")
    require_uppercase: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    require_lowercase: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    require_digit: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    require_symbol: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

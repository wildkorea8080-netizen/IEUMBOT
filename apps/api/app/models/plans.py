from sqlalchemy import Boolean, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Plan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    monthly_base_fee: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    included_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price_per_1k_tokens: Mapped[float] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    chatbot_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_conversation_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overage_policy: Mapped[str] = mapped_column(String(30), nullable=False, default="block")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

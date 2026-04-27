import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Admin(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "admins"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_admins_org_email"),
        Index("ix_admins_org_role", "organization_id", "role"),
    )

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="institution_admin")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="admins")
    audit_logs = relationship("AuditLog", back_populates="admin")
    ingestion_jobs = relationship("IngestionJob", back_populates="created_by_admin")
    retrieval_control_rules = relationship("RetrievalControlRule", back_populates="created_by_admin")
    guardrail_rules = relationship("GuardrailRule", back_populates="created_by_admin")
    escalation_rules = relationship("EscalationRule", back_populates="created_by_admin")

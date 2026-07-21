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
        # 소셜 신원(provider+subject)당 계정 1개. oauth_subject가 NULL(로컬 계정)이면
        # Postgres가 NULL을 서로 다르게 취급하므로 로컬 계정끼리는 충돌하지 않는다.
        UniqueConstraint("auth_provider", "oauth_subject", name="uq_admins_oauth_identity"),
        Index("ix_admins_org_role", "organization_id", "role"),
    )

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="institution_admin")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    # 소셜(OAuth) 계정은 비밀번호가 없으므로 nullable.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 인증 수단: "local"(이메일+비번) | "google" | "kakao" | "naver"
    auth_provider: Mapped[str] = mapped_column(
        String(20), nullable=False, default="local", server_default="local"
    )
    # 제공사 고유 사용자 id (이메일이 바뀌어도 안정적인 식별자)
    oauth_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 이메일 인증 — 셀프 회원가입(local) 계정은 인증 완료 전 로그인 불가.
    # 발급형/소셜 계정은 NULL이어도 무방(로그인 가드에서 local 가입 건만 검사).
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verification_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verification_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 이용약관·개인정보처리방침 동의 시각(개인정보보호법 대응 기록)
    terms_agreed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 비밀번호 재설정 — 인증 토큰과 분리(둘이 동시에 진행될 수 있으므로).
    reset_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reset_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="admins")
    audit_logs = relationship("AuditLog", back_populates="admin")
    ingestion_jobs = relationship("IngestionJob", back_populates="created_by_admin")
    retrieval_control_rules = relationship("RetrievalControlRule", back_populates="created_by_admin")
    guardrail_rules = relationship("GuardrailRule", back_populates="created_by_admin")
    escalation_rules = relationship("EscalationRule", back_populates="created_by_admin")

import os
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db import SessionLocal
from app.models import Admin, Organization

ALLOWED_LOCAL_ENVS = {"local", "development", "dev", "test"}
DEV_ORGANIZATION_SLUG = "local-dev-institution"

SEED_ACCOUNTS: Sequence[dict[str, str | None]] = (
    {
        "email": "super@example.com",
        "name": "Super Admin",
        "role": "super_admin",
        "password": "SuperAdmin123!",
        "organization_slug": None,
    },
    {
        "email": "admin@example.com",
        "name": "Institution Admin",
        "role": "institution_admin",
        "password": "Admin1234!",
        "organization_slug": DEV_ORGANIZATION_SLUG,
    },
)

SEED_ACCOUNT_EMAILS = {str(account["email"]).strip().lower() for account in SEED_ACCOUNTS}


def _ensure_local_environment() -> None:
    api_env = settings.api_env.strip().lower()
    seed_enabled = os.getenv("ENABLE_ADMIN_SEED", "").strip().lower() == "true"
    if api_env not in ALLOWED_LOCAL_ENVS and not seed_enabled:
        allowed = ", ".join(sorted(ALLOWED_LOCAL_ENVS))
        raise SystemExit(
            "Refusing to seed admins because "
            f"API_ENV='{settings.api_env}' is not one of: {allowed} and ENABLE_ADMIN_SEED is not 'true'."
        )


def is_admin_seed_enabled() -> bool:
    return os.getenv("ENABLE_ADMIN_SEED", "").strip().lower() == "true"


def can_auto_seed_admins() -> bool:
    api_env = settings.api_env.strip().lower()
    return api_env in ALLOWED_LOCAL_ENVS or is_admin_seed_enabled()


def is_reserved_seed_email(email: str) -> bool:
    return email.strip().lower() in SEED_ACCOUNT_EMAILS


def _get_or_create_dev_organization(db: Session) -> Organization:
    stmt = select(Organization).where(Organization.slug == DEV_ORGANIZATION_SLUG).limit(1)
    organization = db.execute(stmt).scalar_one_or_none()
    if organization is not None:
        if organization.status != "active":
            organization.status = "active"
        return organization

    organization = Organization(
        name="Local Dev Institution",
        slug=DEV_ORGANIZATION_SLUG,
        status="active",
        primary_domain="local.example.com",
        contact_name="Local Dev Admin",
        contact_email="admin@example.com",
        timezone="Asia/Seoul",
        default_locale="ko-KR",
    )
    db.add(organization)
    db.flush()
    return organization


def _get_admin_by_email(db: Session, email: str) -> Admin | None:
    stmt = select(Admin).where(Admin.email == email).order_by(Admin.created_at.asc()).limit(1)
    return db.execute(stmt).scalar_one_or_none()


def _validate_seed_password(password: object) -> str:
    if not isinstance(password, str):
        raise ValueError("Seed password must be a string.")

    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Seed password must be 72 bytes or fewer for bcrypt.")

    return password


def _upsert_admin(
    db: Session,
    *,
    email: str,
    name: str,
    role: str,
    password: str,
    organization: Organization | None,
) -> str:
    admin = _get_admin_by_email(db, email)
    organization_id = organization.id if organization is not None else None
    validated_password = _validate_seed_password(password)

    if admin is None:
        db.add(
            Admin(
                email=email,
                name=name,
                role=role,
                status="active",
                organization_id=organization_id,
                password_hash=hash_password(validated_password),
                must_change_password=False,
            )
        )
        return "created"

    admin.name = name
    admin.role = role
    admin.status = "active"
    admin.organization_id = organization_id
    admin.must_change_password = False
    # 기존 계정은 비밀번호를 초기화하지 않음 (배포마다 리셋 방지)
    # 단, FORCE_SEED_PASSWORD=true 환경변수가 설정된 경우 강제 초기화
    if os.getenv("FORCE_SEED_PASSWORD", "").strip().lower() == "true":
        admin.password_hash = hash_password(validated_password)
        return "password-reset"
    return "updated"


def seed_admin_accounts(db: Session) -> list[str]:
    organization = _get_or_create_dev_organization(db)
    results: list[str] = []

    for account in SEED_ACCOUNTS:
        account_organization = organization if account["organization_slug"] == DEV_ORGANIZATION_SLUG else None
        action = _upsert_admin(
            db,
            email=str(account["email"]),
            name=str(account["name"]),
            role=str(account["role"]),
            password=str(account["password"]),
            organization=account_organization,
        )
        results.append(f"{action}: {account['role']} <{account['email']}>")

    return results


def main() -> None:
    _ensure_local_environment()

    with SessionLocal() as db:
        results = seed_admin_accounts(db)
        db.commit()

    print("Seeded admin accounts:")
    for line in results:
        print(f"- {line}")
    print(f"- ensured organization: {DEV_ORGANIZATION_SLUG}")


if __name__ == "__main__":
    main()

"""전역 비밀번호 정책 — 조회 · 설정(슈퍼관리자) · 검증.

정책은 단일 행(system_password_policy)에 저장한다. 행이 없으면 DEFAULT_POLICY 사용.
모든 비밀번호 입력 지점(가입·멤버가입·재설정·관리자 변경)이 validate_password()를 쓴다.
"""

import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.system_password_policy import SystemPasswordPolicy

# 안전 하한/상한 — 슈퍼관리자가 지나치게 약하게/터무니없이 강하게 설정하는 것을 방지.
MIN_ALLOWED_LENGTH = 8
MAX_ALLOWED_LENGTH = 64
PASSWORD_MAX_LENGTH = 200  # 저장 한도(해시 전 입력 상한)

DEFAULT_POLICY: dict = {
    "min_length": 8,
    "require_uppercase": True,
    "require_lowercase": False,
    "require_digit": True,
    "require_symbol": True,
}


def _row_to_dict(row: SystemPasswordPolicy) -> dict:
    return {
        "min_length": int(row.min_length),
        "require_uppercase": bool(row.require_uppercase),
        "require_lowercase": bool(row.require_lowercase),
        "require_digit": bool(row.require_digit),
        "require_symbol": bool(row.require_symbol),
    }


def _get_row(db: Session) -> SystemPasswordPolicy | None:
    return db.execute(
        select(SystemPasswordPolicy).order_by(SystemPasswordPolicy.created_at.asc()).limit(1)
    ).scalar_one_or_none()


def get_policy(db: Session) -> dict:
    """현재 적용 중인 정책(행 없으면 기본값)."""
    row = _get_row(db)
    return _row_to_dict(row) if row is not None else dict(DEFAULT_POLICY)


def upsert_policy(
    db: Session,
    *,
    min_length: int,
    require_uppercase: bool,
    require_lowercase: bool,
    require_digit: bool,
    require_symbol: bool,
) -> dict:
    """정책 저장(슈퍼관리자). 길이는 안전 범위로 클램프."""
    clamped_length = max(MIN_ALLOWED_LENGTH, min(int(min_length), MAX_ALLOWED_LENGTH))
    row = _get_row(db)
    if row is None:
        row = SystemPasswordPolicy()
        db.add(row)
    row.min_length = clamped_length
    row.require_uppercase = bool(require_uppercase)
    row.require_lowercase = bool(require_lowercase)
    row.require_digit = bool(require_digit)
    row.require_symbol = bool(require_symbol)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


def validate_password(db: Session, password: str) -> None:
    """정책에 따라 비밀번호 검증. 위반 시 HTTPException(코드) raise."""
    policy = get_policy(db)
    pw = password or ""
    if not (policy["min_length"] <= len(pw) <= PASSWORD_MAX_LENGTH):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_LENGTH"
        )
    if policy["require_uppercase"] and not re.search(r"[A-Z]", pw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_NEEDS_UPPERCASE"
        )
    if policy["require_lowercase"] and not re.search(r"[a-z]", pw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_NEEDS_LOWERCASE"
        )
    if policy["require_digit"] and not re.search(r"\d", pw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_NEEDS_DIGIT"
        )
    if policy["require_symbol"] and not re.search(r"[^A-Za-z0-9]", pw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_NEEDS_SYMBOL"
        )

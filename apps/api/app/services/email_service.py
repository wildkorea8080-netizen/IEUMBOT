"""이메일 발송 — 표준 SMTP(smtplib) 기반.

SendGrid·AWS SES·구글워크스페이스·네이버 등 대부분이 SMTP를 지원하므로
특정 업체 SDK에 종속되지 않고 새 의존성도 필요 없다.

SMTP 미설정 시 발송은 no-op(경고 로그만) — 미설정 환경에서 가입 흐름이 죽지 않게 하되,
호출부가 False를 보고 "메일 발송 실패"를 사용자에게 알릴 수 있도록 bool을 반환한다.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 15


def is_configured() -> bool:
    """SMTP 발송 가능 여부(호스트 + 발신주소)."""
    return bool(settings.smtp_host.strip() and settings.smtp_from.strip())


def _build_message(*, to: str, subject: str, text: str, html: str | None) -> EmailMessage:
    message = EmailMessage()
    sender = settings.smtp_from.strip()
    name = settings.smtp_from_name.strip()
    message["From"] = f"{name} <{sender}>" if name else sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    return message


def send_email(*, to: str, subject: str, text: str, html: str | None = None) -> bool:
    """메일 발송. 성공 True / 미설정·실패 False (예외를 밖으로 던지지 않음)."""
    if not is_configured():
        logger.warning("[EMAIL] SMTP 미설정 — 발송 skip to=%s subject=%s", to, subject)
        return False

    message = _build_message(to=to, subject=subject, text=text, html=html)
    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)
    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=_TIMEOUT_SECONDS) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=_TIMEOUT_SECONDS) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
    except Exception as exc:  # noqa: BLE001 — 메일 실패가 요청 전체를 깨지 않도록
        logger.warning("[EMAIL] 발송 실패 to=%s subject=%s error=%s", to, subject, exc)
        return False

    logger.info("[EMAIL] sent to=%s subject=%s", to, subject)
    return True

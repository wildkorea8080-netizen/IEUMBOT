import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ChatSession, ChatbotSetting, Contract, WidgetDeployment
from app.repositories.logs.audit_log_repository import create_audit_log
from app.services.notification_service import safe_create_notification


def _to_uuid(value: str) -> uuid.UUID:
    return uuid.UUID(value)


def _get_active_contract(db: Session, *, organization_id: str) -> Contract | None:
    today = datetime.now(timezone.utc).date()
    stmt = (
        select(Contract)
        .where(
            Contract.organization_id == _to_uuid(organization_id),
            Contract.status == "active",
            Contract.start_date <= today,
            or_(Contract.end_date.is_(None), Contract.end_date >= today),
        )
        .order_by(Contract.start_date.desc(), Contract.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def _count_widgets(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(WidgetDeployment.id)).where(WidgetDeployment.organization_id == _to_uuid(organization_id))
    return int(db.execute(stmt).scalar_one())


def _count_chatbots(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatbotSetting.id)).where(
        ChatbotSetting.organization_id == _to_uuid(organization_id),
        ChatbotSetting.deleted_at.is_(None),
    )
    return int(db.execute(stmt).scalar_one())


def _count_monthly_conversations(db: Session, *, organization_id: str) -> int:
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        next_month_start = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month_start = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    # MVP 기준: session(created_at) 수를 "conversation" 으로 집계
    stmt = select(func.count(ChatSession.id)).where(
        ChatSession.organization_id == _to_uuid(organization_id),
        ChatSession.created_at >= month_start,
        ChatSession.created_at < next_month_start,
    )
    return int(db.execute(stmt).scalar_one())


def _resolve_overage_policy(contract: Contract) -> str:
    plan = getattr(contract, "plan", None)
    if plan is None:
        return "block"
    return str(getattr(plan, "overage_policy", "block") or "block")


def _enforce_billing_over_limit(
    *,
    db: Session,
    contract: Contract | None,
    organization_id: str,
    target_type: str,
    target_id: str,
    admin_id: str | None,
) -> None:
    if contract is None or not bool(getattr(contract, "is_over_limit", False)):
        return
    if _resolve_overage_policy(contract) != "block":
        return

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=admin_id,
        action="billing.limit.exceeded",
        target_type=target_type,
        target_id=target_id,
        result="blocked",
        request_id=None,
        metadata_json={
            "code": "BILLING_OVER_LIMIT_BLOCKED",
            "contractId": str(contract.id),
            "billingStatus": getattr(contract, "billing_status", None),
        },
    )
    safe_create_notification(
        db,
        type_value="usage_exceeded",
        severity="critical",
        title="Billing over limit blocked request",
        message="A request was blocked because the contract is over limit and overage policy is block.",
        organization_id=organization_id,
        chatbot_id=(target_id if target_type == "chat" else None),
        metadata={"contractId": str(contract.id), "targetType": target_type, "targetId": target_id},
        dedupe_within_minutes=30,
    )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="BILLING_OVER_LIMIT_BLOCKED")


def check_widget_limit(
    db: Session,
    *,
    organization_id: str,
    admin_id: str | None = None,
) -> None:
    contract = _get_active_contract(db, organization_id=organization_id)
    _enforce_billing_over_limit(
        db=db,
        contract=contract,
        organization_id=organization_id,
        target_type="widget",
        target_id=organization_id,
        admin_id=admin_id,
    )
    if contract is None or contract.widget_limit is None:
        return

    current_count = _count_widgets(db, organization_id=organization_id)
    if current_count >= contract.widget_limit:
        create_audit_log(
            db,
            organization_id=organization_id,
            admin_id=admin_id,
            action="limit.blocked",
            target_type="widget",
            target_id=organization_id,
            result="blocked",
            request_id=None,
            metadata_json={
                "code": "WIDGET_LIMIT_EXCEEDED",
                "currentCount": current_count,
                "limit": contract.widget_limit,
                "contractId": str(contract.id),
            },
        )
        safe_create_notification(
            db,
            type_value="usage_exceeded",
            severity="critical",
            title="Widget limit exceeded",
            message="Widget creation was blocked because the organization reached its widget limit.",
            organization_id=organization_id,
            metadata={"contractId": str(contract.id), "currentCount": current_count, "limit": contract.widget_limit},
            dedupe_within_minutes=30,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="WIDGET_LIMIT_EXCEEDED")


def check_chatbot_limit(
    db: Session,
    *,
    organization_id: str,
    admin_id: str | None = None,
) -> None:
    contract = _get_active_contract(db, organization_id=organization_id)
    _enforce_billing_over_limit(
        db=db,
        contract=contract,
        organization_id=organization_id,
        target_type="chatbot",
        target_id=organization_id,
        admin_id=admin_id,
    )
    if contract is None or contract.chatbot_limit is None:
        return

    current_count = _count_chatbots(db, organization_id=organization_id)
    if current_count >= contract.chatbot_limit:
        create_audit_log(
            db,
            organization_id=organization_id,
            admin_id=admin_id,
            action="limit.blocked",
            target_type="chatbot",
            target_id=organization_id,
            result="blocked",
            request_id=None,
            metadata_json={
                "code": "CHATBOT_LIMIT_EXCEEDED",
                "currentCount": current_count,
                "limit": contract.chatbot_limit,
                "contractId": str(contract.id),
            },
        )
        safe_create_notification(
            db,
            type_value="usage_exceeded",
            severity="critical",
            title="Chatbot limit exceeded",
            message="Chatbot creation was blocked because the organization reached its chatbot limit.",
            organization_id=organization_id,
            metadata={"contractId": str(contract.id), "currentCount": current_count, "limit": contract.chatbot_limit},
            dedupe_within_minutes=30,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CHATBOT_LIMIT_EXCEEDED")


def check_conversation_limit(
    db: Session,
    *,
    chatbot_id: str,
    admin_id: str | None = None,
) -> None:
    chatbot_stmt = select(ChatbotSetting).where(ChatbotSetting.id == _to_uuid(chatbot_id))
    chatbot = db.execute(chatbot_stmt).scalar_one_or_none()
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    organization_id = str(chatbot.organization_id)
    contract = _get_active_contract(db, organization_id=organization_id)
    _enforce_billing_over_limit(
        db=db,
        contract=contract,
        organization_id=organization_id,
        target_type="chat",
        target_id=str(chatbot.id),
        admin_id=admin_id,
    )
    if contract is None or contract.monthly_conversation_limit is None:
        return

    current_count = _count_monthly_conversations(db, organization_id=organization_id)
    if current_count >= contract.monthly_conversation_limit:
        create_audit_log(
            db,
            organization_id=organization_id,
            admin_id=admin_id,
            action="limit.blocked",
            target_type="chat",
            target_id=str(chatbot.id),
            result="blocked",
            request_id=None,
            metadata_json={
                "code": "MONTHLY_LIMIT_EXCEEDED",
                "currentCount": current_count,
                "limit": contract.monthly_conversation_limit,
                "contractId": str(contract.id),
            },
        )
        safe_create_notification(
            db,
            type_value="usage_exceeded",
            severity="critical",
            title="Monthly conversation limit exceeded",
            message="A chat request was blocked because the monthly conversation limit was exceeded.",
            organization_id=organization_id,
            chatbot_id=str(chatbot.id),
            metadata={"contractId": str(contract.id), "currentCount": current_count, "limit": contract.monthly_conversation_limit},
            dedupe_within_minutes=30,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="MONTHLY_LIMIT_EXCEEDED")

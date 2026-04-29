from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ChatbotSetting, Document, WebSource, WidgetDeployment


def list_chatbots_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> list[ChatbotSetting]:
    stmt = (
        select(ChatbotSetting)
        .where(ChatbotSetting.organization_id == organization_id)
        .order_by(ChatbotSetting.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_chatbot_by_id(
    db: Session,
    *,
    chatbot_id: str,
) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(ChatbotSetting.id == chatbot_id)
    return db.execute(stmt).scalar_one_or_none()


def get_chatbot_by_org_name(
    db: Session,
    *,
    organization_id: str,
    name: str,
) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.name == name,
        ChatbotSetting.deleted_at.is_(None),
    )
    return db.execute(stmt).scalar_one_or_none()


def create_chatbot(
    db: Session,
    *,
    organization_id: str,
    name: str,
    description_text: str | None = None,
    status: str = "active",
) -> ChatbotSetting:
    row = ChatbotSetting(
        organization_id=organization_id,
        name=name,
        description_text=description_text,
        status=status,
    )
    db.add(row)
    db.flush()
    return row


def count_documents_by_chatbot(
    db: Session,
    *,
    chatbot_id: str,
) -> int:
    stmt = select(func.count(Document.id)).where(Document.chatbot_id == chatbot_id, Document.deleted_at.is_(None))
    return int(db.execute(stmt).scalar_one())


def count_web_sources_by_chatbot(
    db: Session,
    *,
    chatbot_id: str,
) -> int:
    stmt = select(func.count(WebSource.id)).where(WebSource.chatbot_id == chatbot_id, WebSource.is_deleted.is_(False))
    return int(db.execute(stmt).scalar_one())


def count_widgets_by_chatbot(
    db: Session,
    *,
    chatbot_id: str,
) -> int:
    stmt = select(func.count(WidgetDeployment.id)).where(WidgetDeployment.chatbot_id == chatbot_id)
    return int(db.execute(stmt).scalar_one())


def get_last_trained_at_by_chatbot(
    db: Session,
    *,
    chatbot_id: str,
):
    stmt = select(func.max(Document.processed_at)).where(Document.chatbot_id == chatbot_id)
    return db.execute(stmt).scalar_one_or_none()


def list_widgets_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> list[WidgetDeployment]:
    stmt = (
        select(WidgetDeployment)
        .where(WidgetDeployment.organization_id == organization_id)
        .order_by(WidgetDeployment.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def list_widgets(
    db: Session,
) -> list[WidgetDeployment]:
    stmt = select(WidgetDeployment).order_by(WidgetDeployment.created_at.desc())
    return list(db.execute(stmt).scalars().all())


def get_widget_by_id(
    db: Session,
    *,
    widget_id: str,
) -> WidgetDeployment | None:
    stmt = select(WidgetDeployment).where(WidgetDeployment.id == widget_id)
    return db.execute(stmt).scalar_one_or_none()


def create_widget_deployment(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    allowed_domains: list[str],
    status: str = "active",
    install_script: str | None = None,
) -> WidgetDeployment:
    row = WidgetDeployment(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        allowed_domains=allowed_domains,
        status=status,
        install_script=install_script,
    )
    db.add(row)
    db.flush()
    return row

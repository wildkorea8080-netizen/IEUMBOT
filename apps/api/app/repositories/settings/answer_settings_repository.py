from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatbotSetting


def get_chatbot_settings_row(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.id == chatbot_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def save_answer_settings_json(
    db: Session,
    *,
    row: ChatbotSetting,
    answer_settings_json: dict,
) -> ChatbotSetting:
    row.answer_settings_json = answer_settings_json
    row.settings_version = int(row.settings_version) + 1
    db.flush()
    db.refresh(row)
    return row

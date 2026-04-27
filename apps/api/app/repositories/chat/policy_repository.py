from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatbotSetting


def get_chatbot_by_id(db: Session, chatbot_id: str) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(ChatbotSetting.id == chatbot_id)
    return db.execute(stmt).scalar_one_or_none()

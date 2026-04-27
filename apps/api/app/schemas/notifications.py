from typing import Any, Literal

from pydantic import Field

from app.schemas import ApiSchema

NotificationType = Literal["usage_warning", "usage_exceeded", "error", "system", "security"]
NotificationSeverity = Literal["info", "warning", "critical"]
NotificationSentTo = Literal["slack", "email", "webhook", "inapp"]
IntegrationType = Literal["slack", "email", "webhook"]


class NotificationItem(ApiSchema):
    id: str
    type: NotificationType
    severity: NotificationSeverity
    title: str
    message: str
    organization_id: str | None = None
    chatbot_id: str | None = None
    is_read: bool
    sent_to: NotificationSentTo
    metadata: dict[str, Any] = {}
    created_at: str


class NotificationListResponse(ApiSchema):
    items: list[NotificationItem]


class NotificationReadRequest(ApiSchema):
    is_read: bool = Field(default=True, alias="isRead")


class SystemIntegrationItem(ApiSchema):
    id: str
    type: IntegrationType
    config: dict[str, Any]
    is_active: bool
    created_at: str
    updated_at: str


class SystemIntegrationListResponse(ApiSchema):
    items: list[SystemIntegrationItem]


class SystemIntegrationUpsertRequest(ApiSchema):
    type: IntegrationType
    config: dict[str, Any]
    is_active: bool = Field(default=True, alias="isActive")

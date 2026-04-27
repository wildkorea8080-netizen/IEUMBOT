from app.schemas import ApiSchema


class AdminAuditLogItem(ApiSchema):
    log_id: str
    time: str
    admin_email: str | None = None
    admin_name: str | None = None
    action: str
    action_label: str
    action_type: str
    target_type: str | None = None
    target_id: str | None = None
    result: str


class AdminAuditLogsResponse(ApiSchema):
    items: list[AdminAuditLogItem]
    total_count: int
    page: int
    page_size: int


class AdminAuditLogDetailResponse(ApiSchema):
    log_id: str
    time: str
    admin_email: str | None = None
    admin_name: str | None = None
    action: str
    action_label: str
    action_type: str
    target_type: str | None = None
    target_id: str | None = None
    result: str
    metadata_summary: dict[str, str]


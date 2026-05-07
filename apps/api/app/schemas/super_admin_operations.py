from app.schemas import ApiSchema


class SuperAdminBlueprintItem(ApiSchema):
    blueprint_id: str
    organization_name: str
    chatbot_name: str
    created_at: str
    last_used_at: str | None = None
    usage_count: int = 0


class SuperAdminBlueprintListResponse(ApiSchema):
    items: list[SuperAdminBlueprintItem]
    total: int


class SuperAdminBlueprintCreateRequest(ApiSchema):
    source_organization_id: str


class SuperAdminBlueprintApplyRequest(ApiSchema):
    target_organization_id: str
    overwrite_existing: bool = False


class SuperAdminBlueprintResponse(SuperAdminBlueprintItem):
    source_organization_id: str
    source_chatbot_id: str


class SuperAdminBlueprintApplyResponse(ApiSchema):
    blueprint_id: str
    target_organization_id: str
    chatbot_id: str
    widget_id: str | None = None
    overwritten: bool
    applied_at: str

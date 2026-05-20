from decimal import Decimal

from app.schemas import ApiSchema


class SuperAdminApiConfigItem(ApiSchema):
    id: str
    provider: str
    display_name: str
    base_url: str | None = None
    default_model: str | None = None
    fast_model: str | None = None
    embedding_model: str | None = None
    is_active: bool
    is_default: bool
    masked_key: str
    key_status: str = "valid"
    monthly_budget_limit: Decimal | None = None
    memo: str | None = None
    created_at: str
    updated_at: str


class SuperAdminApiConfigListResponse(ApiSchema):
    items: list[SuperAdminApiConfigItem]


class SuperAdminApiConfigCreateRequest(ApiSchema):
    provider: str
    display_name: str
    api_key: str
    base_url: str | None = None
    default_model: str | None = None
    fast_model: str | None = None
    embedding_model: str | None = None
    is_active: bool = True
    is_default: bool = False
    monthly_budget_limit: Decimal | None = None
    memo: str | None = None


class SuperAdminApiConfigUpdateRequest(ApiSchema):
    provider: str | None = None
    display_name: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    default_model: str | None = None
    fast_model: str | None = None
    embedding_model: str | None = None
    is_active: bool | None = None
    is_default: bool | None = None
    monthly_budget_limit: Decimal | None = None
    memo: str | None = None


class SuperAdminApiUsageSummaryResponse(ApiSchema):
    total_calls: int
    total_tokens: int
    estimated_cost: float
    failed_calls: int
    failure_rate: float


class SuperAdminApiUsageByOrganizationItem(ApiSchema):
    organization_id: str
    organization_name: str
    total_calls: int
    total_tokens: int
    estimated_cost: float
    failed_calls: int
    failure_rate: float


class SuperAdminApiUsageByOrganizationResponse(ApiSchema):
    items: list[SuperAdminApiUsageByOrganizationItem]


class SuperAdminApiUsageByChatbotItem(ApiSchema):
    organization_id: str
    chatbot_id: str
    chatbot_name: str
    total_calls: int
    total_tokens: int
    estimated_cost: float
    failed_calls: int
    failure_rate: float


class SuperAdminApiUsageByChatbotResponse(ApiSchema):
    items: list[SuperAdminApiUsageByChatbotItem]


class SuperAdminApiUsageErrorItem(ApiSchema):
    id: str
    organization_id: str
    organization_name: str
    chatbot_id: str
    chatbot_name: str
    provider: str
    model: str | None = None
    operation_type: str
    error_code: str | None = None
    latency_ms: int | None = None
    created_at: str


class SuperAdminApiUsageErrorsResponse(ApiSchema):
    items: list[SuperAdminApiUsageErrorItem]


class AdminApiUsageSummaryResponse(ApiSchema):
    total_calls: int
    total_tokens: int
    estimated_cost: float
    failed_calls: int
    failure_rate: float

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_super_admin_auth
from app.api.super_admin.operations_router import router as operations_router
from app.db import get_db_session
from app.schemas.billing import (
    BillingAlertListResponse,
    PlanCreateRequest,
    PlanItem,
    PlanListResponse,
    PlanUpdateRequest,
    SuperAdminBillingByOrganizationResponse,
    SuperAdminBillingSummaryResponse,
)
from app.schemas.enforcement import (
    AutoEnforcementLogItem,
    AutoEnforcementLogListResponse,
    AutoEnforcementPolicyItem,
    AutoEnforcementPolicyListResponse,
    AutoEnforcementPolicyUpdateRequest,
    AutoEnforcementResolveRequest,
)
from app.schemas.inquiries import (
    ProductInquiryItem,
    ProductInquiryListResponse,
    ProductInquiryUpdateRequest,
)
from app.schemas.notifications import (
    NotificationItem,
    NotificationListResponse,
    NotificationReadRequest,
    SystemIntegrationItem,
    SystemIntegrationListResponse,
    SystemIntegrationUpsertRequest,
)
from app.schemas.super_admin_accounts_contracts import (
    SuperAdminAdminResetPasswordRequest,
    SuperAdminAdminResetPasswordResponse,
    SuperAdminContractCreateDirectRequest,
    SuperAdminContractCreateRequest,
    SuperAdminContractListResponse,
    SuperAdminContractResponse,
    SuperAdminContractUpdateRequest,
    SuperAdminOrgAdminCreateRequest,
    SuperAdminOrgAdminListResponse,
    SuperAdminOrgAdminResponse,
    SuperAdminOrgAdminUpdateRequest,
)
from app.schemas.super_admin_api_configs import (
    SuperAdminApiConfigCreateRequest,
    SuperAdminApiConfigItem,
    SuperAdminApiConfigListResponse,
    SuperAdminApiConfigUpdateRequest,
    SuperAdminApiUsageByChatbotResponse,
    SuperAdminApiUsageByOrganizationResponse,
    SuperAdminApiUsageErrorsResponse,
    SuperAdminApiUsageSummaryResponse,
)
from app.schemas.super_admin_chatbots_widgets import (
    SuperAdminChatbotCreateRequest,
    SuperAdminChatbotDetailResponse,
    SuperAdminChatbotListResponse,
    SuperAdminChatbotUpdateRequest,
    SuperAdminWidgetCreateRequest,
    SuperAdminWidgetCreateResponse,
    SuperAdminWidgetDetailResponse,
    SuperAdminWidgetDomainsUpdateRequest,
    SuperAdminWidgetListResponse,
    SuperAdminWidgetUpdateRequest,
)
from app.schemas.super_admin_impersonation import (
    SuperAdminImpersonationRequest,
    SuperAdminImpersonationResponse,
)
from app.schemas.super_admin_organizations import (
    SuperAdminOrganizationCreateRequest,
    SuperAdminOrganizationCreateResponse,
    SuperAdminOrganizationDetailResponse,
    SuperAdminOrganizationListResponse,
    SuperAdminOrganizationUpdateRequest,
)
from app.schemas.system_controls import (
    SuperAdminAnnouncementCreateRequest,
    SuperAdminAnnouncementItem,
    SuperAdminAnnouncementListResponse,
    SuperAdminAnnouncementUpdateRequest,
    SuperAdminMaintenanceItem,
    SuperAdminMaintenanceUpsertRequest,
)
from app.services.billing_service import (
    create_plan_service,
    get_super_admin_billing_by_organization_service,
    get_super_admin_billing_summary_service,
    list_billing_alerts_service,
    list_plans_service,
    update_plan_service,
)
from app.services.enforcement_service import (
    list_enforcement_logs_service,
    list_enforcement_policies_service,
    resolve_enforcement_log_service,
    update_enforcement_policy_service,
)
from app.services.inquiries_service import list_inquiries_service, update_inquiry_service
from app.services.notification_service import (
    list_integrations_service,
    list_notifications_service,
    mark_notification_read_service,
    upsert_integration_service,
)
from app.services.super_admin.admins_contracts_service import (
    create_contract_service,
    create_org_admin_service,
    delete_admin_service,
    disable_admin_service,
    list_org_admins_service,
    list_org_contracts_service,
    reset_admin_password_service,
    update_admin_service,
    update_contract_service,
)
from app.services.super_admin.api_configs_service import (
    activate_api_config_service,
    create_api_config_service,
    deactivate_api_config_service,
    delete_api_config_service,
    get_api_config_detail_service,
    get_api_usage_summary_service,
    list_api_configs_service,
    list_api_usage_by_chatbot_service,
    list_api_usage_by_organization_service,
    list_api_usage_errors_service,
    set_default_api_config_service,
    update_api_config_service,
)
from app.services.super_admin.chatbots_widgets_service import (
    activate_chatbot_service,
    activate_widget_service,
    create_chatbot_service,
    create_widget_service,
    deactivate_widget_service,
    get_chatbot_detail_service,
    get_widget_detail_service,
    list_all_chatbots_service,
    list_all_widgets_service,
    list_chatbots_service,
    list_widgets_service,
    suspend_chatbot_service,
    update_chatbot_service,
    update_widget_domains_service,
    update_widget_service,
)
from app.services.super_admin.impersonation_service import create_impersonation_session_service
from app.services.super_admin.organizations_service import (
    activate_organization_service,
    create_organization_service,
    get_organization_detail_service,
    list_organizations_service,
    suspend_organization_service,
    update_organization_service,
)
from app.services.system_controls_service import (
    create_announcement_service,
    disable_maintenance_service,
    get_super_admin_maintenance_service,
    list_super_admin_announcements_service,
    update_announcement_service,
    upsert_maintenance_service,
)

router = APIRouter(tags=["super-admin"])
router.include_router(operations_router)


@router.get("/ping")
def super_admin_ping(
    _: AdminPrincipal = Depends(require_super_admin_auth),
) -> dict[str, str]:
    return {"status": "ok", "scope": "super_admin"}


@router.get("/organizations", response_model=SuperAdminOrganizationListResponse)
def super_admin_list_organizations(
    q: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrganizationListResponse:
    return list_organizations_service(
        db,
        principal=principal,
        query=q,
        status_value=status,
        page=page,
        page_size=page_size,
    )


@router.post("/organizations", response_model=SuperAdminOrganizationCreateResponse)
def super_admin_create_organization(
    body: SuperAdminOrganizationCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrganizationCreateResponse:
    return create_organization_service(
        db,
        principal=principal,
        body=body,
    )


@router.get("/organizations/{organization_id}", response_model=SuperAdminOrganizationDetailResponse)
def super_admin_get_organization_detail(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrganizationDetailResponse:
    return get_organization_detail_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.patch(
    "/organizations/{organization_id}", response_model=SuperAdminOrganizationDetailResponse
)
def super_admin_patch_organization(
    organization_id: str,
    body: SuperAdminOrganizationUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrganizationDetailResponse:
    return update_organization_service(
        db,
        principal=principal,
        organization_id=organization_id,
        body=body,
    )


@router.post(
    "/organizations/{organization_id}/activate", response_model=SuperAdminOrganizationDetailResponse
)
def super_admin_activate_organization(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrganizationDetailResponse:
    return activate_organization_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.post(
    "/organizations/{organization_id}/suspend", response_model=SuperAdminOrganizationDetailResponse
)
def super_admin_suspend_organization(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrganizationDetailResponse:
    return suspend_organization_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.post(
    "/organizations/{organization_id}/impersonate", response_model=SuperAdminImpersonationResponse
)
def super_admin_impersonate_organization(
    organization_id: str,
    body: SuperAdminImpersonationRequest,
    request: Request,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminImpersonationResponse:
    return create_impersonation_session_service(
        db,
        principal=principal,
        organization_id=organization_id,
        body=body,
        ip_address=(request.client.host if request.client else None),
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/system/announcements", response_model=SuperAdminAnnouncementListResponse)
def super_admin_list_announcements(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminAnnouncementListResponse:
    return list_super_admin_announcements_service(db, principal=principal)


@router.post("/system/announcements", response_model=SuperAdminAnnouncementItem)
def super_admin_create_announcement(
    body: SuperAdminAnnouncementCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminAnnouncementItem:
    return create_announcement_service(db, principal=principal, body=body)


@router.patch("/system/announcements/{announcement_id}", response_model=SuperAdminAnnouncementItem)
def super_admin_patch_announcement(
    announcement_id: str,
    body: SuperAdminAnnouncementUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminAnnouncementItem:
    return update_announcement_service(
        db, principal=principal, announcement_id=announcement_id, body=body
    )


@router.get("/system/maintenance", response_model=SuperAdminMaintenanceItem)
def super_admin_get_maintenance(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminMaintenanceItem:
    return get_super_admin_maintenance_service(db, principal=principal)


@router.post("/system/maintenance", response_model=SuperAdminMaintenanceItem)
def super_admin_upsert_maintenance(
    body: SuperAdminMaintenanceUpsertRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminMaintenanceItem:
    return upsert_maintenance_service(db, principal=principal, body=body)


@router.post("/system/maintenance/disable", response_model=SuperAdminMaintenanceItem)
def super_admin_disable_maintenance(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminMaintenanceItem:
    return disable_maintenance_service(db, principal=principal)


@router.get(
    "/organizations/{organization_id}/admins", response_model=SuperAdminOrgAdminListResponse
)
def super_admin_list_org_admins(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrgAdminListResponse:
    return list_org_admins_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.post("/organizations/{organization_id}/admins", response_model=SuperAdminOrgAdminResponse)
def super_admin_create_org_admin(
    organization_id: str,
    body: SuperAdminOrgAdminCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrgAdminResponse:
    return create_org_admin_service(
        db,
        principal=principal,
        organization_id=organization_id,
        body=body,
    )


@router.patch("/admins/{admin_id}", response_model=SuperAdminOrgAdminResponse)
def super_admin_patch_admin(
    admin_id: str,
    body: SuperAdminOrgAdminUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrgAdminResponse:
    return update_admin_service(
        db,
        principal=principal,
        admin_id=admin_id,
        body=body,
    )


@router.post(
    "/admins/{admin_id}/reset-password", response_model=SuperAdminAdminResetPasswordResponse
)
def super_admin_reset_admin_password(
    admin_id: str,
    body: SuperAdminAdminResetPasswordRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminAdminResetPasswordResponse:
    return reset_admin_password_service(
        db,
        principal=principal,
        admin_id=admin_id,
        body=body,
    )


@router.post("/admins/{admin_id}/disable", response_model=SuperAdminOrgAdminResponse)
def super_admin_disable_admin(
    admin_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminOrgAdminResponse:
    return disable_admin_service(
        db,
        principal=principal,
        admin_id=admin_id,
    )


@router.delete("/admins/{admin_id}", status_code=204)
def super_admin_delete_admin(
    admin_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> None:
    delete_admin_service(
        db,
        principal=principal,
        admin_id=admin_id,
    )


@router.get(
    "/organizations/{organization_id}/contracts", response_model=SuperAdminContractListResponse
)
def super_admin_list_org_contracts(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminContractListResponse:
    return list_org_contracts_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.post(
    "/organizations/{organization_id}/contracts", response_model=SuperAdminContractResponse
)
def super_admin_create_contract(
    organization_id: str,
    body: SuperAdminContractCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminContractResponse:
    return create_contract_service(
        db,
        principal=principal,
        organization_id=organization_id,
        body=body,
    )


@router.post("/contracts", response_model=SuperAdminContractResponse)
def super_admin_create_contract_direct(
    body: SuperAdminContractCreateDirectRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminContractResponse:
    return create_contract_service(
        db,
        principal=principal,
        organization_id=body.organization_id,
        body=SuperAdminContractCreateRequest(**body.model_dump(exclude={"organization_id"})),
    )


@router.patch("/contracts/{contract_id}", response_model=SuperAdminContractResponse)
def super_admin_patch_contract(
    contract_id: str,
    body: SuperAdminContractUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminContractResponse:
    return update_contract_service(
        db,
        principal=principal,
        contract_id=contract_id,
        body=body,
    )


@router.get(
    "/organizations/{organization_id}/chatbots", response_model=SuperAdminChatbotListResponse
)
def super_admin_list_chatbots(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotListResponse:
    return list_chatbots_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.get("/chatbots", response_model=SuperAdminChatbotListResponse)
def super_admin_list_all_chatbots(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotListResponse:
    return list_all_chatbots_service(
        db,
        principal=principal,
    )


@router.get("/chatbots/{chatbot_id}", response_model=SuperAdminChatbotDetailResponse)
def super_admin_get_chatbot(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotDetailResponse:
    return get_chatbot_detail_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
    )


@router.patch("/chatbots/{chatbot_id}", response_model=SuperAdminChatbotDetailResponse)
def super_admin_patch_chatbot(
    chatbot_id: str,
    body: SuperAdminChatbotUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotDetailResponse:
    return update_chatbot_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.post("/chatbots", response_model=SuperAdminChatbotDetailResponse)
def super_admin_create_chatbot(
    body: SuperAdminChatbotCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotDetailResponse:
    return create_chatbot_service(
        db,
        principal=principal,
        body=body,
    )


@router.post("/chatbots/{chatbot_id}/activate", response_model=SuperAdminChatbotDetailResponse)
def super_admin_activate_chatbot(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotDetailResponse:
    return activate_chatbot_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
    )


@router.post("/chatbots/{chatbot_id}/suspend", response_model=SuperAdminChatbotDetailResponse)
def super_admin_suspend_chatbot(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminChatbotDetailResponse:
    return suspend_chatbot_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
    )


@router.get("/organizations/{organization_id}/widgets", response_model=SuperAdminWidgetListResponse)
def super_admin_list_widgets(
    organization_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetListResponse:
    return list_widgets_service(
        db,
        principal=principal,
        organization_id=organization_id,
    )


@router.get("/widgets", response_model=SuperAdminWidgetListResponse)
def super_admin_list_all_widgets(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetListResponse:
    return list_all_widgets_service(
        db,
        principal=principal,
    )


@router.post("/widgets", response_model=SuperAdminWidgetCreateResponse)
def super_admin_create_widget(
    body: SuperAdminWidgetCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetCreateResponse:
    return create_widget_service(
        db,
        principal=principal,
        body=body,
    )


@router.get("/widgets/{widget_id}", response_model=SuperAdminWidgetDetailResponse)
def super_admin_get_widget(
    widget_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetDetailResponse:
    return get_widget_detail_service(
        db,
        principal=principal,
        widget_id=widget_id,
    )


@router.patch("/widgets/{widget_id}", response_model=SuperAdminWidgetDetailResponse)
def super_admin_patch_widget(
    widget_id: str,
    body: SuperAdminWidgetUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetDetailResponse:
    return update_widget_service(
        db,
        principal=principal,
        widget_id=widget_id,
        body=body,
    )


@router.post("/widgets/{widget_id}/activate", response_model=SuperAdminWidgetDetailResponse)
def super_admin_activate_widget(
    widget_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetDetailResponse:
    return activate_widget_service(
        db,
        principal=principal,
        widget_id=widget_id,
    )


@router.post("/widgets/{widget_id}/deactivate", response_model=SuperAdminWidgetDetailResponse)
def super_admin_deactivate_widget(
    widget_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetDetailResponse:
    return deactivate_widget_service(
        db,
        principal=principal,
        widget_id=widget_id,
    )


@router.patch("/widgets/{widget_id}/domains", response_model=SuperAdminWidgetDetailResponse)
def super_admin_update_widget_domains(
    widget_id: str,
    body: SuperAdminWidgetDomainsUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminWidgetDetailResponse:
    return update_widget_domains_service(
        db,
        principal=principal,
        widget_id=widget_id,
        body=body,
    )


@router.get("/api-configs", response_model=SuperAdminApiConfigListResponse)
def super_admin_list_api_configs(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigListResponse:
    return list_api_configs_service(db, principal=principal)


@router.post("/api-configs", response_model=SuperAdminApiConfigItem)
def super_admin_create_api_config(
    body: SuperAdminApiConfigCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigItem:
    return create_api_config_service(db, principal=principal, body=body)


@router.get("/api-configs/{config_id}", response_model=SuperAdminApiConfigItem)
def super_admin_get_api_config(
    config_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigItem:
    return get_api_config_detail_service(db, principal=principal, config_id=config_id)


@router.patch("/api-configs/{config_id}", response_model=SuperAdminApiConfigItem)
def super_admin_patch_api_config(
    config_id: str,
    body: SuperAdminApiConfigUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigItem:
    return update_api_config_service(db, principal=principal, config_id=config_id, body=body)


@router.post("/api-configs/{config_id}/activate", response_model=SuperAdminApiConfigItem)
def super_admin_activate_api_config(
    config_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigItem:
    return activate_api_config_service(db, principal=principal, config_id=config_id)


@router.post("/api-configs/{config_id}/deactivate", response_model=SuperAdminApiConfigItem)
def super_admin_deactivate_api_config(
    config_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigItem:
    return deactivate_api_config_service(db, principal=principal, config_id=config_id)


@router.post("/api-configs/{config_id}/set-default", response_model=SuperAdminApiConfigItem)
def super_admin_set_default_api_config(
    config_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiConfigItem:
    return set_default_api_config_service(db, principal=principal, config_id=config_id)


@router.delete("/api-configs/{config_id}")
def super_admin_delete_api_config(
    config_id: str,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict[str, str]:
    return delete_api_config_service(db, principal=principal, config_id=config_id)


@router.get("/api-usage/summary", response_model=SuperAdminApiUsageSummaryResponse)
def super_admin_api_usage_summary(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiUsageSummaryResponse:
    return get_api_usage_summary_service(db, principal=principal)


@router.get("/api-usage/by-organization", response_model=SuperAdminApiUsageByOrganizationResponse)
def super_admin_api_usage_by_organization(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiUsageByOrganizationResponse:
    return list_api_usage_by_organization_service(db, principal=principal)


@router.get("/api-usage/by-chatbot", response_model=SuperAdminApiUsageByChatbotResponse)
def super_admin_api_usage_by_chatbot(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiUsageByChatbotResponse:
    return list_api_usage_by_chatbot_service(db, principal=principal)


@router.get("/api-usage/errors", response_model=SuperAdminApiUsageErrorsResponse)
def super_admin_api_usage_errors(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminApiUsageErrorsResponse:
    return list_api_usage_errors_service(db, principal=principal)


@router.get("/billing/plans", response_model=PlanListResponse)
def super_admin_list_billing_plans(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> PlanListResponse:
    return list_plans_service(db, principal=principal)


@router.post("/billing/plans", response_model=PlanItem)
def super_admin_create_billing_plan(
    body: PlanCreateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> PlanItem:
    return create_plan_service(db, principal=principal, body=body)


@router.patch("/billing/plans/{plan_id}", response_model=PlanItem)
def super_admin_patch_billing_plan(
    plan_id: str,
    body: PlanUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> PlanItem:
    return update_plan_service(db, principal=principal, plan_id=plan_id, body=body)


@router.get("/billing/summary", response_model=SuperAdminBillingSummaryResponse)
def super_admin_billing_summary(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminBillingSummaryResponse:
    return get_super_admin_billing_summary_service(db, principal=principal)


@router.get("/billing/by-organization", response_model=SuperAdminBillingByOrganizationResponse)
def super_admin_billing_by_organization(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SuperAdminBillingByOrganizationResponse:
    return get_super_admin_billing_by_organization_service(db, principal=principal)


@router.get("/billing/alerts", response_model=BillingAlertListResponse)
def super_admin_billing_alerts(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> BillingAlertListResponse:
    return list_billing_alerts_service(db, principal=principal)


@router.get("/notifications", response_model=NotificationListResponse)
def super_admin_list_notifications(
    severity: str | None = Query(default=None),
    type_value: str | None = Query(default=None, alias="type"),
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> NotificationListResponse:
    _ = principal
    return list_notifications_service(
        db, organization_id=None, severity=severity, type_value=type_value
    )


@router.patch("/notifications/{notification_id}/read", response_model=NotificationItem)
def super_admin_mark_notification_read(
    notification_id: str,
    body: NotificationReadRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> NotificationItem:
    return mark_notification_read_service(
        db,
        principal=principal,
        notification_id=notification_id,
        is_read=body.is_read,
    )


@router.get("/system-integrations", response_model=SystemIntegrationListResponse)
def super_admin_list_system_integrations(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SystemIntegrationListResponse:
    return list_integrations_service(db, principal=principal)


@router.post("/system-integrations", response_model=SystemIntegrationItem)
def super_admin_create_system_integration(
    body: SystemIntegrationUpsertRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SystemIntegrationItem:
    return upsert_integration_service(db, principal=principal, integration_id=None, body=body)


@router.patch("/system-integrations/{integration_id}", response_model=SystemIntegrationItem)
def super_admin_patch_system_integration(
    integration_id: str,
    body: SystemIntegrationUpsertRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> SystemIntegrationItem:
    return upsert_integration_service(
        db, principal=principal, integration_id=integration_id, body=body
    )


@router.get("/enforcement/policies", response_model=AutoEnforcementPolicyListResponse)
def super_admin_list_enforcement_policies(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> AutoEnforcementPolicyListResponse:
    return list_enforcement_policies_service(db, principal=principal)


@router.patch("/enforcement/policies/{policy_id}", response_model=AutoEnforcementPolicyItem)
def super_admin_patch_enforcement_policy(
    policy_id: str,
    body: AutoEnforcementPolicyUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> AutoEnforcementPolicyItem:
    return update_enforcement_policy_service(
        db, principal=principal, policy_id=policy_id, body=body
    )


@router.get("/enforcement/logs", response_model=AutoEnforcementLogListResponse)
def super_admin_list_enforcement_logs(
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> AutoEnforcementLogListResponse:
    return list_enforcement_logs_service(db, principal=principal)


@router.post("/enforcement/logs/{log_id}/resolve", response_model=AutoEnforcementLogItem)
def super_admin_resolve_enforcement_log(
    log_id: str,
    body: AutoEnforcementResolveRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> AutoEnforcementLogItem:
    return resolve_enforcement_log_service(
        db, principal=principal, log_id=log_id, reason=body.reason
    )


# ── 도입 문의(리드) ───────────────────────────────────────────────────────────


@router.get("/inquiries", response_model=ProductInquiryListResponse)
def super_admin_list_inquiries(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> ProductInquiryListResponse:
    return list_inquiries_service(
        db, status_filter=status, limit=page_size, offset=(page - 1) * page_size
    )


@router.patch("/inquiries/{inquiry_id}", response_model=ProductInquiryItem)
def super_admin_update_inquiry(
    inquiry_id: str,
    body: ProductInquiryUpdateRequest,
    principal: AdminPrincipal = Depends(require_super_admin_auth),
    db: Session = Depends(get_db_session),
) -> ProductInquiryItem:
    return update_inquiry_service(
        db, inquiry_id=inquiry_id, status_value=body.status, handled_note=body.handled_note
    )

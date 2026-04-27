from fastapi import APIRouter

from app.api.admin.api_usage_router import router as api_usage_router
from app.api.admin.billing_router import router as billing_router
from app.api.admin.audit_logs_router import router as audit_logs_router
from app.api.admin.answer_settings_router import router as answer_settings_router
from app.api.admin.conversations_router import router as conversations_router
from app.api.admin.escalations_router import router as escalations_router
from app.api.admin.guardrails_router import router as guardrails_router
from app.api.admin.impersonation_router import router as impersonation_router
from app.api.admin.install_guide_router import router as install_guide_router
from app.api.admin.knowledge_router import router as knowledge_router
from app.api.admin.logs_router import router as admin_logs_router
from app.api.admin.notifications_router import router as notifications_router
from app.api.admin.operations_router import router as operations_router
from app.api.admin.security_router import router as security_router
from app.api.admin.search_control_router import router as search_control_router
from app.api.admin.users_router import router as users_router
from app.api.admin.usage_router import router as usage_router

router = APIRouter(tags=["admin"])
router.include_router(operations_router)
router.include_router(conversations_router)
router.include_router(security_router)
router.include_router(usage_router)
router.include_router(billing_router)
router.include_router(api_usage_router)
router.include_router(notifications_router)
router.include_router(audit_logs_router)
router.include_router(install_guide_router)
router.include_router(knowledge_router)
router.include_router(search_control_router)
router.include_router(users_router)
router.include_router(answer_settings_router)
router.include_router(guardrails_router)
router.include_router(escalations_router)
router.include_router(admin_logs_router)
router.include_router(impersonation_router)


@router.get("/ping")
def admin_ping() -> dict[str, str]:
    return {"status": "ok"}

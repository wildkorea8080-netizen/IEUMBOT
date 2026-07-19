from fastapi import APIRouter, Depends

from app.api.admin.router import router as admin_router
from app.api.auth.oauth_router import router as oauth_router
from app.api.auth.router import router as auth_router
from app.api.chat.router import router as chat_router
from app.api.dependencies import require_admin_auth, require_institution_admin_auth
from app.api.documents.router import router as documents_router
from app.api.health import router as health_router
from app.api.logs.router import router as logs_router
from app.api.public.router import router as public_router
from app.api.settings.router import router as settings_router
from app.api.super_admin.router import router as super_admin_router
from app.api.widget.router import router as widget_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(public_router, prefix="/public")
api_router.include_router(auth_router, prefix="/admin/auth")
# 공개 SNS OAuth (셀프서비스 가입/로그인) — 인증 의존성 없음
api_router.include_router(oauth_router, prefix="/auth")
api_router.include_router(admin_router, prefix="/admin", dependencies=[Depends(require_institution_admin_auth)])
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(
    super_admin_router,
    prefix="/super-admin",
    dependencies=[Depends(require_admin_auth)],
)
api_router.include_router(documents_router, prefix="/documents", dependencies=[Depends(require_admin_auth)])
api_router.include_router(settings_router, prefix="/settings", dependencies=[Depends(require_admin_auth)])
api_router.include_router(logs_router, prefix="/logs", dependencies=[Depends(require_admin_auth)])
api_router.include_router(widget_router, prefix="/widget", tags=["widget"])

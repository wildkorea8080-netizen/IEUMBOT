from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.repositories.admin.operations_repository import get_widget_by_chatbot, list_chatbots
from app.schemas.install_guide import AdminInstallGuideItem, AdminInstallGuideResponse
from app.services.admin.scope_service import require_institution_organization_id
from app.services.widget_install_script import build_widget_install_script


def get_install_guide_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> AdminInstallGuideResponse:
    organization_id = require_institution_organization_id(principal)
    chatbots = list_chatbots(db, organization_id=organization_id)

    items: list[AdminInstallGuideItem] = []
    for chatbot in chatbots:
        widget = get_widget_by_chatbot(db, organization_id=organization_id, chatbot_id=str(chatbot.id))
        theme = chatbot.theme if isinstance(getattr(chatbot, "theme", None), dict) else {}
        if widget is None:
            items.append(
                AdminInstallGuideItem(
                    chatbot_id=str(chatbot.id),
                    chatbot_name=chatbot.name,
                    widget_id=None,
                    widget_name=None,
                    status="missing",
                    is_active=False,
                    allowed_domains=[],
                    theme_color=None,
                    position=None,
                    created_at=None,
                    install_script=None,
                    has_widget=False,
                )
            )
            continue

        install_script = build_widget_install_script(
            chatbot_id=str(widget.chatbot_id),
            launcher_label=widget.launcher_label,
            launcher_icon=theme.get("widgetLauncherIcon") if isinstance(theme.get("widgetLauncherIcon"), str) else None,
            launcher_icon_url=(
                theme.get("widgetLauncherIconUrl") if isinstance(theme.get("widgetLauncherIconUrl"), str) else None
            ),
        )
        items.append(
            AdminInstallGuideItem(
                chatbot_id=str(chatbot.id),
                chatbot_name=chatbot.name,
                widget_id=str(widget.id),
                widget_name=widget.launcher_label or f"{chatbot.name} Widget",
                status=widget.status,
                is_active=(widget.status == "active"),
                allowed_domains=list(widget.allowed_domains or []),
                theme_color=widget.theme_color,
                position=widget.position,
                created_at=widget.created_at.isoformat(),
                install_script=install_script,
                has_widget=True,
            )
        )
    return AdminInstallGuideResponse(items=items)

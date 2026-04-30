from app.core.config import settings


def build_widget_install_script(
    *,
    chatbot_id: str,
    api_base_url: str | None = None,
    open_on_load: bool = False,
) -> str:
    resolved_api_base_url = (api_base_url or settings.widget_public_api_base_url).strip()
    return (
        "<script\n"
        '  src="/widget.js"\n'
        f'  data-chatbot-id="{chatbot_id}"\n'
        f'  data-api-base-url="{resolved_api_base_url}"\n'
        f'  data-open-on-load="{"true" if open_on_load else "false"}"\n'
        "></script>"
    )

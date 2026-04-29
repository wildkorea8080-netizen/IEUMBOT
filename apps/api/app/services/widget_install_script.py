DEFAULT_WIDGET_API_BASE_URL = "https://ieumbot-api.onrender.com/api"


def build_widget_install_script(
    *,
    chatbot_id: str,
    api_base_url: str = DEFAULT_WIDGET_API_BASE_URL,
    open_on_load: bool = False,
) -> str:
    return (
        "<script\n"
        '  src="/widget.js"\n'
        f'  data-chatbot-id="{chatbot_id}"\n'
        f'  data-api-base-url="{api_base_url}"\n'
        f'  data-open-on-load="{"true" if open_on_load else "false"}"\n'
        "></script>"
    )

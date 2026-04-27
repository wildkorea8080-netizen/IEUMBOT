def build_widget_install_script(
    *,
    chatbot_id: str,
    api_base_url: str = "/api",
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


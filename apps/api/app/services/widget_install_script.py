from html import escape

from app.core.config import settings


def build_widget_install_script(
    *,
    chatbot_id: str,
    api_base_url: str | None = None,
    open_on_load: bool = False,
    launcher_label: str | None = None,
    launcher_icon: str | None = None,
    launcher_icon_url: str | None = None,
) -> str:
    resolved_api_base_url = (api_base_url or settings.widget_public_api_base_url).strip()
    attrs: list[tuple[str, str]] = [
        ("src", "/widget.js"),
        ("data-chatbot-id", chatbot_id),
        ("data-api-base-url", resolved_api_base_url),
        ("data-open-on-load", "true" if open_on_load else "false"),
    ]
    if launcher_label and launcher_label.strip():
        attrs.append(("data-launcher-label", launcher_label.strip()))
    if launcher_icon and launcher_icon.strip():
        attrs.append(("data-launcher-icon", launcher_icon.strip()))
    if launcher_icon_url and launcher_icon_url.strip():
        attrs.append(("data-launcher-icon-url", launcher_icon_url.strip()))

    lines = ["<script"]
    lines.extend(f'  {name}="{escape(value, quote=True)}"' for name, value in attrs)
    lines.append("></script>")
    return (
        "\n".join(lines)
    )

from html import escape

from app.core.config import settings


def _to_absolute(path: str, web_base: str) -> str:
    """상대경로(/ 시작)를 web_base_url 기준 절대 URL로 변환한다."""
    if path.startswith("/") and web_base:
        return web_base.rstrip("/") + path
    return path


def build_widget_install_script(
    *,
    chatbot_id: str,
    api_base_url: str | None = None,
    open_on_load: bool = False,
    launcher_label: str | None = None,
    launcher_icon: str | None = None,
    launcher_icon_url: str | None = None,
) -> str:
    resolved_api_base_url = (api_base_url or settings.api_widget_public_api_base_url).strip()
    web_base = settings.api_widget_public_web_base_url.strip()
    src_url = _to_absolute("/widget.js", web_base) if web_base else "/widget.js"

    attrs: list[tuple[str, str]] = [
        ("src", src_url),
        ("data-chatbot-id", chatbot_id),
        ("data-api-base-url", resolved_api_base_url),
        ("data-open-on-load", "true" if open_on_load else "false"),
    ]
    if launcher_label and launcher_label.strip():
        attrs.append(("data-launcher-label", launcher_label.strip()))
    if launcher_icon and launcher_icon.strip():
        attrs.append(("data-launcher-icon", launcher_icon.strip()))
    if launcher_icon_url and launcher_icon_url.strip():
        icon = _to_absolute(launcher_icon_url.strip(), web_base)
        attrs.append(("data-launcher-icon-url", icon))

    lines = ["<script"]
    lines.extend(f'  {name}="{escape(value, quote=True)}"' for name, value in attrs)
    lines.append("></script>")
    return "\n".join(lines)

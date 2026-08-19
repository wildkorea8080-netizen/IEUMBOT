"""메뉴 권한 키가 프런트·백엔드·사이드바 셋 다에서 맞물리는지 확인한다.

키는 세 곳에 흩어져 있다.

  apps/api/app/core/menu_permissions.py      MENU_KEYS
  apps/web/lib/admin-ui/menu-permissions.ts  MenuKey + MENU_CATALOG
  apps/web/components/layout/admin-nav.ts    사이드바 항목

품질 리포트는 화면도 API도 야간 채점 크론도 다 있는데 사이드바에만 없어서
아무도 결과를 못 봤다. 카탈로그에서 빠지면 기관사용자에게는 메뉴가 통째로
사라지기까지 한다 — 어느 쪽이든 조용히 어긋난다.
"""

import re
from pathlib import Path

from app.core.menu_permissions import MENU_KEYS

_WEB = Path(__file__).resolve().parents[2] / "web"
_TS_PERMISSIONS = _WEB / "lib" / "admin-ui" / "menu-permissions.ts"
_TS_NAV = _WEB / "components" / "layout" / "admin-nav.ts"


def _catalog() -> list[tuple[str, str]]:
    """menu-permissions.ts 의 MENU_CATALOG → [(key, href)]."""
    text = _TS_PERMISSIONS.read_text(encoding="utf-8")
    return re.findall(r'\{\s*key:\s*"([^"]+)",\s*label:\s*"[^"]*",\s*href:\s*"([^"]+)"', text)


def _nav_hrefs() -> list[str]:
    return re.findall(r'href:\s*"(/admin/[^"]+)"', _TS_NAV.read_text(encoding="utf-8"))


def test_카탈로그_키가_백엔드_목록과_같다():
    catalog_keys = [key for key, _ in _catalog()]

    assert catalog_keys == list(MENU_KEYS), (
        "menu_permissions.py 의 MENU_KEYS 와 menu-permissions.ts 의 MENU_CATALOG 가 "
        f"어긋납니다.\n  백엔드: {list(MENU_KEYS)}\n  프런트: {catalog_keys}"
    )


def test_카탈로그의_모든_href가_사이드바에_있다():
    """카탈로그에만 있고 사이드바에 없으면 기관관리자도 메뉴를 못 찾는다."""
    nav = set(_nav_hrefs())
    missing = [href for _, href in _catalog() if href not in nav]

    assert not missing, f"사이드바(admin-nav.ts)에 없는 메뉴: {missing}"


def test_품질_리포트가_세_곳에_모두_있다():
    """야간 채점 크론이 매일 도는 기능이다. 링크가 없으면 비용만 나간다."""
    assert "quality_report" in MENU_KEYS
    assert ("quality_report", "/admin/quality-report") in _catalog()
    assert "/admin/quality-report" in _nav_hrefs()

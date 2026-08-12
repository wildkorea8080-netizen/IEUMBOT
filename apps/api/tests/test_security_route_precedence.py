"""보안 이벤트 경로가 어느 핸들러로 가는지 고정한다.

배경: /security/events 를 두 라우터가 각각 등록해 놓고 있었다. FastAPI는 먼저
등록된 쪽을 쓰는데, 하필 화면이 기대하지 않는 쪽(security_router)이 앞에 있어
보안센터가 통째로 빈 화면이었다 — 통계 카드는 전부 0, 표는 모든 칸이 빈칸.
응답에 items는 있었기 때문에 오류도 나지 않고 조용히 잘못 나왔다.

/security/events/export 도 뒤 라우터의 /security/events/{event_id} 에
event_id="export" 로 잡혀 CSV 내보내기가 깨졌다.

둘 다 등록 순서에만 의존하므로 순서를 테스트로 못 박는다.
"""

from app.main import create_app
from fastapi.routing import APIRoute


def _route_for(path: str) -> APIRoute:
    """실제 매칭 규칙대로 그 경로를 처리할 첫 라우트를 찾는다."""
    app = create_app()
    for route in app.routes:
        if not isinstance(route, APIRoute) or "GET" not in route.methods:
            continue
        match, _ = route.matches({"type": "http", "method": "GET", "path": path, "headers": []})
        if match.name == "FULL":
            return route
    raise AssertionError(f"{path} 를 처리하는 라우트가 없다")


def test_event_list_is_served_by_the_router_the_screen_expects() -> None:
    route = _route_for("/api/admin/security/events")

    # 화면은 {items, total, summary} 를 읽는다 — security_events_router 쪽 응답이다.
    assert route.endpoint.__module__.endswith(
        "security_events_router"
    ), f"보안센터 화면이 기대하지 않는 핸들러가 잡혔다: {route.endpoint.__module__}"


def test_csv_export_is_not_captured_by_the_event_id_route() -> None:
    route = _route_for("/api/admin/security/events/export")

    assert route.path.endswith(
        "/export"
    ), f"export가 {route.path} 에 잡혔다 — CSV 내보내기가 깨진다"


def test_event_detail_still_resolves() -> None:
    route = _route_for("/api/admin/security/events/6f1c8d20-0000-0000-0000-000000000000")

    assert "{event_id}" in route.path

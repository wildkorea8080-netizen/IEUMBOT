"""이벤트 루프 차단 회귀 방지 가드.

배경(2026-07-31 운영 장애):
    파일 업로드 엔드포인트만 `async def`였고, 그 안에서 동기 blocking 작업
    (PDF 추출 → OCR → OpenAI 임베딩)을 호출했다. uvicorn 워커가 1개라
    색인이 도는 90~213초 동안 asyncio 이벤트 루프가 통째로 멈췄고,
    그 시간 동안 위젯 설정 조회·관리자 로그인·헬스체크까지 전부 무응답이었다.
    "위젯이 사라지고 로그인이 안 되다가 저절로 돌아오는" 증상의 정체.

불변식:
    app/api/**, app/services/** 의 모든 요청 처리 코드는 **동기(def)** 여야 한다.
    그래야 FastAPI가 스레드풀에서 실행하고, 이벤트 루프는 항상 비어 있다.
    (실제 비동기가 필요하면 app/workers/ 처럼 asyncio.to_thread로 blocking을 격리할 것)

실행:
    cd apps/api && pytest tests/ -q
"""

from __future__ import annotations

import ast
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1] / "app"
GUARDED_DIRS = ("api", "services")


def _async_defs_in(path: Path) -> list[tuple[str, int]]:
    """파일 안의 async def 목록 → [(함수명, 줄번호)]."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return [
        (node.name, node.lineno)
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef)
    ]


def test_no_async_handlers_in_request_path() -> None:
    """요청 경로에 async def가 없어야 한다 (있으면 blocking 호출 시 서버 전체 정지)."""
    offenders: list[str] = []
    for directory in GUARDED_DIRS:
        for py_file in sorted((API_ROOT / directory).rglob("*.py")):
            for name, lineno in _async_defs_in(py_file):
                rel = py_file.relative_to(API_ROOT.parent)
                offenders.append(f"{rel}:{lineno} async def {name}")

    assert not offenders, (
        "요청 경로에 async def가 추가됐다. 동기 blocking 호출이 하나라도 있으면 "
        "이벤트 루프가 멈춰 API 전체가 무응답이 된다.\n"
        "동기 def로 바꾸거나, 정말 async가 필요하면 blocking 부분을 "
        "asyncio.to_thread / run_in_threadpool로 격리할 것.\n  - "
        + "\n  - ".join(offenders)
    )


def test_maintenance_middleware_does_not_touch_db_on_event_loop() -> None:
    """미들웨어는 모든 요청을 거치므로, dispatch가 DB를 직접 열면 안 된다.

    (SessionLocal 체크아웃은 풀이 마르면 대기 → 이벤트 루프 정지)
    DB 조회는 캐시 미스일 때만, 그것도 run_in_threadpool 경유여야 한다.
    """
    path = API_ROOT / "core" / "middleware" / "maintenance.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    dispatch = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "dispatch"
    )
    called_names = {
        node.func.id
        for node in ast.walk(dispatch)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }

    assert "SessionLocal" not in called_names, (
        "dispatch()가 DB 세션을 직접 연다 — 모든 요청이 이벤트 루프에서 DB를 때리게 된다."
    )
    assert "run_in_threadpool" in called_names, (
        "DB 조회는 run_in_threadpool로 스레드풀에 넘겨야 한다."
    )

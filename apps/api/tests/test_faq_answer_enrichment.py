"""FAQ 답변도 RAG 답변과 동일한 부가 정보를 갖는지 회귀 방지.

배경(2026-08-03 사용자 제보):
    FAQ에 등록된 내용으로 답변할 때는 추천질문·CTA 버튼이 하나도 안 나오고
    등록된 답변만 나오고 끝났다. 파일(RAG) 기반 답변과 화면 구성이 달랐다.

원인:
    파이프라인의 FAQ 매칭 분기가 `_persist_immediate_response()`로 **조기 반환**
    하면서, 그 뒤에 있는 추천질문 생성·조건별 CTA 매칭·구조화 응답 변환 단계를
    통째로 건너뛰었다. 응답 객체의 해당 필드가 빈 채로 나갔다.

불변식:
    - `_persist_immediate_response`는 follow_up_questions / conditional_actions /
      structured_response 를 받아 응답에 실을 수 있어야 한다.
    - FAQ 분기(reason="faq_match")는 그 인자들을 반드시 채워서 호출해야 한다.

실행: cd apps/api && pytest tests/ -q
"""

from __future__ import annotations

import ast
from pathlib import Path

PIPELINE_SRC = (
    Path(__file__).resolve().parents[1]
    / "app" / "services" / "chat" / "final_chat_pipeline_service.py"
)

_TREE = ast.parse(PIPELINE_SRC.read_text(encoding="utf-8"))


def _find_function(name: str) -> ast.FunctionDef:
    for node in ast.walk(_TREE):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise AssertionError(f"{name} 함수를 찾지 못함(이름 변경?)")


def _find_faq_call() -> ast.Call:
    """reason="faq_match" 로 호출되는 _persist_immediate_response 호출부."""
    for node in ast.walk(_TREE):
        if not isinstance(node, ast.Call):
            continue
        if getattr(node.func, "id", None) != "_persist_immediate_response":
            continue
        for kw in node.keywords:
            if (
                kw.arg == "reason"
                and isinstance(kw.value, ast.Constant)
                and kw.value.value == "faq_match"
            ):
                return node
    raise AssertionError("FAQ 분기의 _persist_immediate_response 호출을 찾지 못함")


def test_immediate_response_accepts_enrichment_args() -> None:
    """즉시응답 헬퍼가 부가 정보 인자를 받을 수 있어야 한다."""
    fn = _find_function("_persist_immediate_response")
    params = {a.arg for a in fn.args.args} | {a.arg for a in fn.args.kwonlyargs}
    for required in ("follow_up_questions", "conditional_actions", "structured_response"):
        assert required in params, f"{required} 인자가 없다 — FAQ 답변에 부가 정보를 실을 수 없음"


def test_immediate_response_passes_conditional_actions_through() -> None:
    """받은 conditional_actions 가 응답 객체에 실려야 한다(받고 버리면 무의미)."""
    fn = _find_function("_persist_immediate_response")
    response_calls = [
        node for node in ast.walk(fn)
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "ChatRuntimeResponse"
    ]
    assert response_calls, "ChatRuntimeResponse 생성부를 찾지 못함"
    passed = {kw.arg for call in response_calls for kw in call.keywords}
    for field in ("follow_up_questions", "conditional_actions", "structured_response"):
        assert field in passed, f"ChatRuntimeResponse에 {field} 가 전달되지 않음"


def test_faq_branch_fills_enrichment() -> None:
    """FAQ 분기가 추천질문·CTA·구조화 응답을 채워서 호출해야 한다."""
    call = _find_faq_call()
    passed = {kw.arg for kw in call.keywords}
    for field in ("follow_up_questions", "conditional_actions", "structured_response"):
        assert field in passed, (
            f"FAQ 분기가 {field} 를 넘기지 않는다 — FAQ 답변만 나오고 "
            "추천질문/버튼이 사라지는 증상이 재발한다."
        )


def _normalized_variable_names() -> set[str]:
    """`X = _normalize_answer_layout(...)` 형태로 정규화를 거친 변수 이름들."""
    names: set[str] = set()
    for node in ast.walk(_TREE):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        if getattr(node.value.func, "id", None) != "_normalize_answer_layout":
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                names.add(target.id)
    return names


def test_faq_branch_normalizes_answer_layout() -> None:
    """FAQ 답변도 마크다운 레이아웃 정규화를 거쳐야 한다(표 깨짐 방지).

    직접 호출로 넘기든, 정규화 결과를 담은 변수로 넘기든 모두 허용한다.
    """
    call = _find_faq_call()
    answer_kw = next((kw for kw in call.keywords if kw.arg == "answer_text"), None)
    assert answer_kw is not None, "answer_text 인자가 없음"

    value = answer_kw.value
    if isinstance(value, ast.Call):
        normalized = getattr(value.func, "id", None) == "_normalize_answer_layout"
    elif isinstance(value, ast.Name):
        normalized = value.id in _normalized_variable_names()
    else:
        normalized = False

    assert normalized, (
        "FAQ 답변이 _normalize_answer_layout 을 통과하지 않는다 "
        "— FAQ 본문에 한 줄로 뭉친 표가 있으면 그대로 깨져 보인다."
    )

"""답변 마크다운 레이아웃 정규화 회귀 방지.

배경(2026-08-03 운영 이슈):
    위젯 답변이 "## 제목 | 구분 | 내용 | --- |" 처럼 한 줄로 뭉쳐 노출됐다.
    원인은 두 가지가 겹친 것:
      1) 모델이 소제목·표 행을 줄바꿈 없이 한 줄로 출력 (기존 정규화가 복원)
      2) 모델이 표 **칸 안에 '- ' 목록을 여러 줄** 넣음 → 그 행이 '|'로 끝나지
         않아 표가 헤더에서 끊기고 나머지 파이프가 화면에 그대로 노출
    마크다운 표는 한 행이 한 줄이어야 하므로 (2)는 표로 표현이 불가능하다.
    → 소제목('**구분**') + '- ' 목록으로 변환한다. 좁은 위젯 폭에서 더 잘 읽힌다.

불변식:
    - 셀에 줄바꿈이 든 표는 파이프가 하나도 남지 않게 목록으로 변환된다.
    - 각 행이 한 줄로 온전한 정상 표는 절대 건드리지 않는다.

실행: cd apps/api && pytest tests/ -q
"""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Any

PIPELINE_SRC = (
    Path(__file__).resolve().parents[1]
    / "app" / "services" / "chat" / "final_chat_pipeline_service.py"
)

# 이 함수들은 순수 문자열 처리라 DB/설정 없이 검증할 수 있다.
# 모듈 전체를 import하면 설정·모델·엔진까지 끌고 오므로, 소스에서 해당 정의만 실행한다.
_WANTED = (
    "_is_separator_row",
    "_split_prose_and_header",
    "_table_row_cells",
    "_flatten_multiline_tables",
    "_normalize_answer_layout",
)


def _load_layout_helpers() -> dict[str, Any]:
    tree = ast.parse(PIPELINE_SRC.read_text(encoding="utf-8"))
    namespace: dict[str, Any] = {"re": re}
    for node in tree.body:
        is_sep_const = (
            isinstance(node, ast.Assign)
            and getattr(node.targets[0], "id", "") == "_SEP_ROW_RE"
        )
        is_wanted_fn = isinstance(node, ast.FunctionDef) and node.name in _WANTED
        if is_sep_const or is_wanted_fn:
            exec(compile(ast.Module([node], []), str(PIPELINE_SRC), "exec"), namespace)  # noqa: S102
    missing = set(_WANTED) - namespace.keys()
    assert not missing, f"정규화 함수를 찾지 못함(이름 변경?): {missing}"
    return namespace


NORMALIZE = _load_layout_helpers()["_normalize_answer_layout"]

# 운영에서 실제로 깨져 나온 형태: 한 줄로 뭉침 + 셀 안 여러 줄 목록
BROKEN_ANSWER = (
    "네, 실업급여 수급조건에 대해 안내해 드릴게요. "
    "## 실업급여 수급조건 | 구분 | 내용 | | --- | --- | "
    "| 대상/자격 | - 고용보험에 가입되어 있어야 하며, 피보험 단위기간 충족 필요\n"
    "- 비자발적 이직(해고, 계약만료, 임금체불 등)이어야 함\n"
    "- 자진퇴사의 경우 2개월 이상 임금체불이어야 수급 가능 | "
    "| 신청방법/절차 | - 거주지 관할 고용복지센터 방문 또는 온라인 신청 가능\n"
    "- 이직 사실과 자격요건을 소명해야 함 | "
    "| 유의사항 | - 계약만료 퇴사 시 무기계약직 전환 여부에 따라 인정 가능 |"
)

# 정상 답변 — 정규화가 손대면 안 된다
GOOD_ANSWER = (
    "네, 안내 문자서비스 등록 방법에 대해 안내해 드릴게요.\n\n"
    "## 안내 문자서비스 관련 문의처\n"
    "| 구분 | 내용 |\n"
    "| --- | --- |\n"
    "| 문의처 | 은평구시설관리공단 공공시설팀 |\n"
    "| 전화번호 | 02-350-5243 |"
)


def test_broken_table_leaves_no_raw_pipes() -> None:
    """셀에 줄바꿈이 든 표는 파이프가 화면에 노출되면 안 된다."""
    result = NORMALIZE(BROKEN_ANSWER)
    assert "|" not in result, f"파이프가 그대로 남음:\n{result}"


def test_broken_table_becomes_labeled_bullets() -> None:
    """표의 첫 칸은 굵은 라벨로, 나머지는 '- ' 목록으로 변환된다."""
    result = NORMALIZE(BROKEN_ANSWER)
    assert "**대상/자격**" in result
    assert "**신청방법/절차**" in result
    assert "**유의사항**" in result
    assert result.count("\n- ") >= 5, f"목록 항목이 부족:\n{result}"


def test_inline_heading_is_split_to_own_line() -> None:
    """문장 뒤에 붙은 '## 소제목'은 자기 줄로 분리된다."""
    result = NORMALIZE(BROKEN_ANSWER)
    assert "\n## 실업급여 수급조건" in result
    assert "드릴게요. ##" not in result


def test_well_formed_table_is_untouched() -> None:
    """각 행이 한 줄인 정상 표는 그대로 유지된다(회귀 방지)."""
    result = NORMALIZE(GOOD_ANSWER)
    assert "| 구분 | 내용 |" in result
    assert "| 전화번호 | 02-350-5243 |" in result
    assert "**문의처**" not in result, "정상 표가 목록으로 변형됨"


def test_normalize_is_idempotent() -> None:
    """이미 정규화된 텍스트를 다시 넣어도 달라지지 않아야 한다."""
    once = NORMALIZE(BROKEN_ANSWER)
    twice = NORMALIZE(once)
    assert once == twice


def test_plain_answer_without_markdown_is_unchanged() -> None:
    """표·소제목이 없는 평범한 답변은 손대지 않는다."""
    plain = "안녕하세요. 문의하신 내용은 담당 부서로 연결해 드리겠습니다."
    assert NORMALIZE(plain) == plain

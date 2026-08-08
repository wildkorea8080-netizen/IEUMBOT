# AI 답변 품질 자동 평가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 대화를 상위 LLM이 채점해 답변 적합성·문서 근거성·대화 맥락 유지·주제 이탈·추천질문 적합성을 산출하고, 품질 리포트 화면에 충족률로 표시한다.

**Architecture:** 새 테이블 `answer_evaluations` 하나에 건별 채점 결과를 쌓는다. 야간 ARQ 크론이 전날 `answered` 메시지를 골라, 규칙으로 확정 가능한 건은 LLM 없이 판정하고 나머지는 상위 모델에 1회 호출로 6지표를 채점시킨다. 기관별 스위치(`answerPolicy.qualityEvaluationEnabled`, JSONB)로 켠 기관만 평가한다. 화면은 기존 품질 리포트를 확장한다.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy 2.0 / Alembic / ARQ / Next.js 14 + TypeScript

**Spec:** `docs/superpowers/specs/2026-08-09-answer-quality-evaluation-design.md`

---

## File Structure

**신규 (백엔드)**
| 파일 | 책임 |
|---|---|
| `apps/api/app/models/answer_evaluations.py` | ORM 모델 |
| `apps/api/app/services/quality/evaluation_selector.py` | 대상 선별 (순수 함수) |
| `apps/api/app/services/quality/evaluation_rules.py` | 규칙 선판정 (순수 함수) |
| `apps/api/app/services/quality/evaluation_prompt.py` | 채점 프롬프트 조립 + 응답 파싱 (순수 함수) |
| `apps/api/app/services/quality/evaluation_service.py` | 배치 오케스트레이션 (DB·LLM) |
| `apps/api/app/services/quality/evaluation_aggregate.py` | 충족률 집계 (순수 함수) |
| `apps/api/app/repositories/quality/answer_evaluation_repository.py` | DB 접근 |

순수 함수와 I/O를 파일로 분리한다. 이 프로젝트의 테스트가 순수 함수 단위라 그 경계를 그대로 따른다.

**수정 (백엔드)**
| 파일 | 변경 |
|---|---|
| `apps/api/app/models/__init__.py` | `AnswerEvaluation` 등록 |
| `apps/api/app/schemas/answer_settings.py` | `quality_evaluation_enabled` 필드 |
| `apps/api/app/schemas/admin_operations.py` | 품질 응답 스키마 확장 |
| `apps/api/app/services/admin/operations_service.py` | 품질 리포트에 평가 집계 병합 |
| `apps/api/app/api/admin/operations_router.py` | 소급 평가 엔드포인트 2개 |
| `apps/api/app/workers/main.py` | 크론 + 작업 함수 등록 |
| `apps/api/app/api/health.py` | BUILD_TAG |

**수정 (프론트)**
| 파일 | 변경 |
|---|---|
| `apps/web/lib/api/admin-operations-types.ts` | 응답 타입 |
| `apps/web/lib/api/admin-operations.ts` | 소급 평가 API 함수 |
| `apps/web/app/admin/quality-report/page.tsx` | 섹션 2 추가 |
| `apps/web/app/admin/ai/style/page.tsx` | 활성화 토글 |

---

## Task 1: 활성화 설정 필드

기관별 on/off. JSONB라 마이그레이션이 없다.

**Files:**
- Modify: `apps/api/app/schemas/answer_settings.py`
- Test: `apps/api/tests/test_quality_evaluation.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/tests/test_quality_evaluation.py` 를 새로 만든다.

```python
"""AI 답변 품질 자동 평가.

원자료(chat_messages)는 이미 다 쌓이고 있어 평가 레이어만 얹는다.
LLM 호출은 모킹하고, 순수 함수의 판정·집계 로직을 고정한다.
"""

from app.schemas.answer_settings import AnswerSettings


def test_quality_evaluation_is_disabled_by_default() -> None:
    """기본 꺼짐 — 켜지 않은 기관에는 비용이 발생하지 않아야 한다."""
    assert AnswerSettings().answer_policy.quality_evaluation_enabled is False


def test_quality_evaluation_can_be_enabled() -> None:
    settings = AnswerSettings()
    settings.answer_policy.quality_evaluation_enabled = True
    assert settings.answer_policy.quality_evaluation_enabled is True
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: FAIL — `AttributeError: 'AnswerPolicySettings' object has no attribute 'quality_evaluation_enabled'`

- [ ] **Step 3: 필드 추가**

`apps/api/app/schemas/answer_settings.py` 의 `AnswerPolicySettings` 클래스에서
`suggest_next_question` 정의 바로 아래에 추가한다.

```python
    # 답변 품질 자동 평가(야간 배치 LLM 채점) 사용 여부.
    # 기본 False — 켠 기관에만 평가 비용이 발생한다. 경영평가·품질관리가
    # 필요한 기관만 켜면 된다.
    quality_evaluation_enabled: bool = False
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/app/schemas/answer_settings.py apps/api/tests/test_quality_evaluation.py
git commit -m "feat(quality): 기관별 품질 평가 활성화 설정 추가"
```

---

## Task 2: ORM 모델 + 마이그레이션

**Files:**
- Create: `apps/api/app/models/answer_evaluations.py`
- Modify: `apps/api/app/models/__init__.py`
- Create: `apps/api/alembic/versions/<자동생성>_add_answer_evaluations.py`

- [ ] **Step 1: 모델 작성**

`apps/api/app/models/answer_evaluations.py`

```python
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AnswerEvaluation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """답변 1건에 대한 품질 채점 결과.

    점수가 NULL인 경우가 정상적으로 존재한다 — 첫 턴에는 대화 맥락이 성립하지 않고,
    추천질문이 없으면 그 적합성도 없다. 0점으로 채우면 평균이 왜곡되므로 NULL로 두고
    집계 분모에서 제외한다.
    """

    __tablename__ = "answer_evaluations"
    __table_args__ = (
        # 같은 메시지를 두 번 평가하지 않는다. 소급 평가를 여러 번 눌러도 안전하다.
        UniqueConstraint("message_id", name="uq_answer_evaluations_message"),
        Index("ix_answer_evaluations_chatbot_time", "chatbot_id", "evaluated_at"),
        Index("ix_answer_evaluations_review", "chatbot_id", "needs_review"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    relevance_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    groundedness_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    context_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    followup_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    topic_drift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 지표별 판정 사유. 심사 표본 검증과 검토 목록 표시에 쓴다.
    verdict_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # 'llm' | 'rule' | 'failed' — "이 수치는 전부 AI가 채점한 것입니까"에 답하기 위해 구분한다.
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="llm")
    evaluator_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 채점 기준이 바뀌면 전후 수치를 그대로 비교하면 안 된다.
    prompt_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1")

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 평가 시점 단가로 계산한 스냅샷. 권위 있는 값은 토큰이다.
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
```

- [ ] **Step 2: 레지스트리 등록**

`apps/api/app/models/__init__.py` — import 블록(알파벳 순, `from app.models.admins` 다음)과
`__all__` 양쪽에 추가한다.

```python
from app.models.answer_evaluations import AnswerEvaluation
```

`__all__` 리스트에 `"AnswerEvaluation",` 추가.

- [ ] **Step 3: import 확인**

Run: `cd apps/api && python -c "from app.models import AnswerEvaluation; print(AnswerEvaluation.__tablename__)"`
Expected: `answer_evaluations`

- [ ] **Step 4: 마이그레이션 생성**

Run: `cd apps/api && alembic revision --autogenerate -m "add_answer_evaluations"`

- [ ] **Step 5: 마이그레이션 내용 검토**

생성된 파일을 열어 확인한다. **`answer_evaluations` 테이블 생성과 인덱스 3개
(unique 1 + index 2) 외에 다른 테이블에 대한 변경이 있으면 삭제한다.**
autogenerate가 무관한 diff를 끼워 넣는 경우가 있다(프로젝트 규칙).

- [ ] **Step 6: 마이그레이션 적용**

Run: `cd apps/api && alembic upgrade head`
Expected: 오류 없이 완료

- [ ] **Step 7: 커밋**

```bash
git add apps/api/app/models/answer_evaluations.py apps/api/app/models/__init__.py apps/api/alembic/versions/
git commit -m "feat(quality): answer_evaluations 테이블 추가"
```

---

## Task 3: 대상 선별 규칙

어떤 메시지를 평가할지 정하는 순수 함수. DB를 모른다.

**Files:**
- Create: `apps/api/app/services/quality/__init__.py` (빈 파일)
- Create: `apps/api/app/services/quality/evaluation_selector.py`
- Modify: `apps/api/tests/test_quality_evaluation.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/tests/test_quality_evaluation.py` 끝에 추가한다.

```python
from app.services.quality.evaluation_selector import SkipReason, should_evaluate


class _Msg:
    """ORM 대신 쓰는 최소 스텁. 선별 함수는 속성만 읽는다."""

    def __init__(self, **kw):
        self.role = kw.get("role", "assistant")
        self.is_test = kw.get("is_test", False)
        self.final_decision = kw.get("final_decision", {"outcome": "answered"})
        self.metadata_json = kw.get("metadata_json", {})


def test_answered_assistant_message_is_evaluated() -> None:
    assert should_evaluate(_Msg()) is None


def test_user_message_is_skipped() -> None:
    assert should_evaluate(_Msg(role="user")) is SkipReason.NOT_ASSISTANT


def test_test_message_is_skipped() -> None:
    assert should_evaluate(_Msg(is_test=True)) is SkipReason.TEST_MESSAGE


def test_non_answered_outcomes_are_skipped() -> None:
    """모르는 걸 정직하게 답한 건을 품질 미달로 세면, 아는 척할수록 점수가 오른다."""
    for outcome in ("insufficient_evidence", "escalate", "restricted"):
        msg = _Msg(final_decision={"outcome": outcome})
        assert should_evaluate(msg) is SkipReason.NOT_ANSWERED, outcome


def test_simple_greeting_is_skipped() -> None:
    msg = _Msg(metadata_json={"trace": {"simpleResponseApplied": True}})
    assert should_evaluate(msg) is SkipReason.SIMPLE_RESPONSE


def test_cache_hit_is_skipped() -> None:
    msg = _Msg(final_decision={"outcome": "answered", "reason": "answer_cache_hit"})
    assert should_evaluate(msg) is SkipReason.CACHE_HIT
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.quality'`

- [ ] **Step 3: 구현**

`apps/api/app/services/quality/__init__.py` — 빈 파일로 생성.

`apps/api/app/services/quality/evaluation_selector.py`

```python
"""평가 대상 선별. 순수 함수 — DB나 LLM을 모른다."""

from enum import Enum
from typing import Any


class SkipReason(str, Enum):
    NOT_ASSISTANT = "not_assistant"
    TEST_MESSAGE = "test_message"
    NOT_ANSWERED = "not_answered"
    SIMPLE_RESPONSE = "simple_response"
    CACHE_HIT = "cache_hit"


def _field(obj: Any, name: str, default: Any) -> Any:
    value = getattr(obj, name, None)
    return default if value is None else value


def should_evaluate(message: Any) -> SkipReason | None:
    """평가 대상이면 None, 아니면 제외 사유를 돌려준다.

    answered 가 아닌 건은 평가하지 않는다. 근거가 없어 "확인하기 어렵습니다"라고
    정직하게 답한 건을 품질 미달로 세면, 모르는 것을 아는 척할수록 점수가 오르는
    지표가 된다. 이관·정책차단도 답변 품질을 논할 대상이 아니다.
    """
    if _field(message, "role", "") != "assistant":
        return SkipReason.NOT_ASSISTANT
    if bool(_field(message, "is_test", False)):
        return SkipReason.TEST_MESSAGE

    decision = _field(message, "final_decision", {}) or {}
    if decision.get("outcome") != "answered":
        return SkipReason.NOT_ANSWERED
    if decision.get("reason") == "answer_cache_hit":
        return SkipReason.CACHE_HIT

    trace = (_field(message, "metadata_json", {}) or {}).get("trace") or {}
    if trace.get("simpleResponseApplied"):
        return SkipReason.SIMPLE_RESPONSE

    return None
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: PASS (8 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/app/services/quality/ apps/api/tests/test_quality_evaluation.py
git commit -m "feat(quality): 평가 대상 선별 규칙"
```

---

## Task 4: 규칙 선판정

LLM 없이 확정되는 판정. 비용을 줄이고, 확정적인 값은 채점자에게 맡기지 않는다.

**Files:**
- Create: `apps/api/app/services/quality/evaluation_rules.py`
- Modify: `apps/api/tests/test_quality_evaluation.py`

- [ ] **Step 1: 실패하는 테스트 작성**

테스트 파일 끝에 추가한다.

```python
from app.services.quality.evaluation_rules import RulePreVerdict, apply_rules


def test_no_citation_means_zero_groundedness() -> None:
    """근거 없이 답했으면 환각 위험. LLM에 물을 것도 없다."""
    verdict = apply_rules(selected_sources=[], is_faq=False, followups=[], is_out_of_scope=False)
    assert verdict.groundedness_score == 0
    assert verdict.needs_review is True
    assert verdict.decided_fully is True


def test_faq_answer_is_grounded_by_definition() -> None:
    """FAQ는 등록 답변 자체가 근거다. 다만 적합성은 LLM이 봐야 한다."""
    verdict = apply_rules(selected_sources=[], is_faq=True, followups=["a"], is_out_of_scope=False)
    assert verdict.groundedness_score == 100
    assert verdict.decided_fully is False


def test_no_followup_scores_null_not_zero() -> None:
    """추천질문이 없으면 적합성도 없다. 0점은 평균을 왜곡한다."""
    verdict = apply_rules(
        selected_sources=[{"id": "s1"}], is_faq=False, followups=[], is_out_of_scope=False
    )
    assert verdict.followup_score is None
    assert verdict.followup_decided is True


def test_out_of_scope_sets_topic_drift() -> None:
    verdict = apply_rules(
        selected_sources=[{"id": "s1"}], is_faq=False, followups=["a"], is_out_of_scope=True
    )
    assert verdict.topic_drift is True


def test_normal_case_defers_to_llm() -> None:
    verdict = apply_rules(
        selected_sources=[{"id": "s1"}], is_faq=False, followups=["a"], is_out_of_scope=False
    )
    assert verdict.decided_fully is False
    assert verdict.groundedness_score is None
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.quality.evaluation_rules'`

- [ ] **Step 3: 구현**

`apps/api/app/services/quality/evaluation_rules.py`

```python
"""LLM 없이 확정되는 판정. 순수 함수."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RulePreVerdict:
    groundedness_score: int | None = None
    followup_score: int | None = None
    topic_drift: bool = False
    needs_review: bool = False
    # 추천질문 점수가 규칙으로 확정됐는가 (없어서 NULL인 경우도 확정이다)
    followup_decided: bool = False
    # 이 건은 LLM 호출이 아예 필요 없는가
    decided_fully: bool = False
    reasons: dict[str, str] = field(default_factory=dict)


def apply_rules(
    *,
    selected_sources: list[dict[str, Any]],
    is_faq: bool,
    followups: list[str],
    is_out_of_scope: bool,
) -> RulePreVerdict:
    verdict = RulePreVerdict()

    if is_out_of_scope:
        verdict.topic_drift = True
        verdict.needs_review = True
        verdict.reasons["topicDrift"] = "파이프라인이 업무 범위 밖으로 판정함"

    if not followups:
        verdict.followup_score = None
        verdict.followup_decided = True
        verdict.reasons["followup"] = "추천질문 없음 — 평가 대상 아님"

    if is_faq:
        # 등록된 FAQ 답변 자체가 근거다. 적합성(FAQ가 질문에 맞는가)은 LLM이 본다.
        verdict.groundedness_score = 100
        verdict.reasons["groundedness"] = "FAQ 등록 답변 — 근거 자체"
        return verdict

    if not selected_sources:
        # 근거 없이 답했다 — 환각 위험이 가장 큰 경우다.
        verdict.groundedness_score = 0
        verdict.needs_review = True
        verdict.decided_fully = True
        verdict.reasons["groundedness"] = "인용 근거 없음"

    return verdict
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: PASS (13 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/app/services/quality/evaluation_rules.py apps/api/tests/test_quality_evaluation.py
git commit -m "feat(quality): 규칙 선판정 (LLM 호출 없이 확정되는 건)"
```

---

## Task 5: 채점 프롬프트 조립 + 응답 파싱

**Files:**
- Create: `apps/api/app/services/quality/evaluation_prompt.py`
- Modify: `apps/api/tests/test_quality_evaluation.py`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
from app.services.quality.evaluation_prompt import (
    PROMPT_VERSION,
    build_evaluation_prompt,
    parse_evaluation_response,
)


def test_prompt_includes_question_answer_and_sources() -> None:
    prompt = build_evaluation_prompt(
        question="거주자주차 이용요금",
        answer="월 4만원입니다.",
        sources=[{"textPreview": "거주자주차 월 40,000원"}],
        previous_turn=None,
        followups=["신청 방법은?"],
    )
    assert "거주자주차 이용요금" in prompt
    assert "월 4만원입니다." in prompt
    assert "거주자주차 월 40,000원" in prompt
    assert "신청 방법은?" in prompt


def test_prompt_sends_only_cited_sources() -> None:
    """검색 전체가 아니라 인용분만 보낸다 — 입력 토큰의 절반을 줄이는 최적화."""
    prompt = build_evaluation_prompt(
        question="q",
        answer="a",
        sources=[{"textPreview": "인용된 근거"}],
        previous_turn=None,
        followups=[],
    )
    assert "인용된 근거" in prompt


def test_prompt_omits_context_section_on_first_turn() -> None:
    prompt = build_evaluation_prompt(
        question="q", answer="a", sources=[], previous_turn=None, followups=[]
    )
    assert "직전 대화" not in prompt


def test_parse_valid_response() -> None:
    raw = """{
      "relevance": {"reason": "질문에 직접 답함", "score": 92},
      "groundedness": {"reason": "근거와 일치", "score": 88},
      "context": {"reason": "해당 없음", "score": null},
      "topicDrift": {"reason": "업무 범위 내", "drift": false},
      "followup": {"reason": "맥락에 맞음", "score": 80}
    }"""
    parsed = parse_evaluation_response(raw)
    assert parsed.relevance_score == 92
    assert parsed.groundedness_score == 88
    assert parsed.context_score is None
    assert parsed.topic_drift is False
    assert parsed.followup_score == 80
    assert parsed.reasons["relevance"] == "질문에 직접 답함"


def test_parse_response_wrapped_in_code_fence() -> None:
    """모델이 ```json 으로 감싸는 경우가 흔하다."""
    raw = '```json\n{"relevance": {"reason": "r", "score": 70}}\n```'
    parsed = parse_evaluation_response(raw)
    assert parsed.relevance_score == 70


def test_parse_broken_json_returns_none() -> None:
    assert parse_evaluation_response("설명만 하고 JSON이 없음") is None


def test_parse_clamps_out_of_range_scores() -> None:
    raw = '{"relevance": {"reason": "r", "score": 130}, "groundedness": {"reason": "r", "score": -5}}'
    parsed = parse_evaluation_response(raw)
    assert parsed.relevance_score == 100
    assert parsed.groundedness_score == 0


def test_prompt_version_is_recorded() -> None:
    """기준이 바뀌면 전후 수치를 그대로 비교하면 안 된다."""
    assert PROMPT_VERSION == "v1"
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.quality.evaluation_prompt'`

- [ ] **Step 3: 구현**

`apps/api/app/services/quality/evaluation_prompt.py`

```python
"""채점 프롬프트 조립과 응답 파싱. 순수 함수 — LLM을 호출하지 않는다."""

import json
import re
from dataclasses import dataclass, field
from typing import Any

PROMPT_VERSION = "v1"

# 근거 청크는 그대로 넣으면 입력 토큰의 대부분을 차지한다. 채점에는 이 정도면 충분하다.
_SOURCE_CHAR_LIMIT = 700
_MAX_SOURCES = 5

_SYSTEM = (
    "너는 공공기관 AI 상담 답변을 채점하는 평가자다. "
    "각 항목마다 판정 사유를 먼저 쓰고 그다음 점수를 매겨라. "
    "JSON 하나만 출력하고 다른 말은 하지 마라."
)

_CRITERIA = """채점 기준 (0~100, 70점이 기준선)
- 90~100 근거·질문에 정확히 부합
- 70~89  요구를 충족하나 개선 여지
- 40~69  부분적으로 어긋남
- 0~39   부적합

항목
- relevance    답변이 질문이 요구한 것에 실제로 답했는가
- groundedness 답변의 각 진술이 아래 근거로 뒷받침되는가 (근거에 없는 내용은 감점)
- context      직전 대화를 올바로 이어받았는가 (직전 대화가 없으면 score를 null)
- topicDrift   기관 업무 범위를 벗어났는가 (drift: true/false)
- followup     제시한 추천질문이 맥락에 맞는가 (추천질문이 없으면 score를 null)

출력 형식
{"relevance":{"reason":"...","score":0},"groundedness":{"reason":"...","score":0},
 "context":{"reason":"...","score":null},"topicDrift":{"reason":"...","drift":false},
 "followup":{"reason":"...","score":null}}"""


def build_evaluation_prompt(
    *,
    question: str,
    answer: str,
    sources: list[dict[str, Any]],
    previous_turn: str | None,
    followups: list[str],
) -> str:
    parts = [_CRITERIA, "", f"[질문]\n{question}", "", f"[답변]\n{answer}"]

    if sources:
        lines = []
        for index, source in enumerate(sources[:_MAX_SOURCES], start=1):
            text = str(source.get("textPreview") or source.get("text") or "").strip()
            lines.append(f"[S{index}] {text[:_SOURCE_CHAR_LIMIT]}")
        parts += ["", "[인용 근거]", "\n".join(lines)]
    else:
        parts += ["", "[인용 근거]\n(없음)"]

    if previous_turn:
        parts += ["", f"[직전 대화]\n{previous_turn[:400]}"]

    if followups:
        parts += ["", "[추천질문]\n" + "\n".join(f"- {q}" for q in followups[:3])]

    return "\n".join(parts)


def system_prompt() -> str:
    return _SYSTEM


@dataclass
class ParsedEvaluation:
    relevance_score: int | None = None
    groundedness_score: int | None = None
    context_score: int | None = None
    followup_score: int | None = None
    topic_drift: bool = False
    reasons: dict[str, str] = field(default_factory=dict)


def _clamp(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return None


def _extract_json(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    # ```json ... ``` 로 감싸는 경우가 흔하다.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if not brace:
            return None
        text = brace.group(0)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_evaluation_response(raw: str) -> ParsedEvaluation | None:
    """채점 응답 파싱. 형식이 깨졌으면 None — 호출부가 재시도한다."""
    data = _extract_json(raw or "")
    if data is None:
        return None

    result = ParsedEvaluation()
    for key, attr in (
        ("relevance", "relevance_score"),
        ("groundedness", "groundedness_score"),
        ("context", "context_score"),
        ("followup", "followup_score"),
    ):
        item = data.get(key) or {}
        if isinstance(item, dict):
            setattr(result, attr, _clamp(item.get("score")))
            reason = str(item.get("reason") or "").strip()
            if reason:
                result.reasons[key] = reason

    drift = data.get("topicDrift") or {}
    if isinstance(drift, dict):
        result.topic_drift = bool(drift.get("drift"))
        reason = str(drift.get("reason") or "").strip()
        if reason:
            result.reasons["topicDrift"] = reason

    return result
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: PASS (21 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/app/services/quality/evaluation_prompt.py apps/api/tests/test_quality_evaluation.py
git commit -m "feat(quality): 채점 프롬프트 조립 + 응답 파싱"
```

---

## Task 6: 충족률 집계

숫자 전체가 여기에 달려 있다. NULL 처리와 임계값이 틀리면 모든 지표가 틀린다.

**Files:**
- Create: `apps/api/app/services/quality/evaluation_aggregate.py`
- Modify: `apps/api/tests/test_quality_evaluation.py`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
from app.services.quality.evaluation_aggregate import PASS_THRESHOLD, summarize


class _Eval:
    def __init__(self, **kw):
        self.relevance_score = kw.get("relevance_score")
        self.groundedness_score = kw.get("groundedness_score")
        self.context_score = kw.get("context_score")
        self.followup_score = kw.get("followup_score")
        self.topic_drift = kw.get("topic_drift", False)
        self.needs_review = kw.get("needs_review", False)
        self.method = kw.get("method", "llm")


def test_pass_threshold_is_seventy() -> None:
    """임계값은 고정이다. 기관마다 다르면 기관 간·연도 간 비교가 무너진다."""
    assert PASS_THRESHOLD == 70


def test_pass_rate_counts_scores_at_or_above_threshold() -> None:
    rows = [_Eval(relevance_score=s) for s in (69, 70, 71, 100)]
    summary = summarize(rows)
    assert summary.relevance.sample_size == 4
    assert summary.relevance.pass_rate == 75.0  # 70,71,100


def test_null_scores_are_excluded_from_denominator() -> None:
    """첫 턴 맥락·추천질문 없음은 NULL이다. 0점으로 세면 평균이 왜곡된다."""
    rows = [_Eval(context_score=90), _Eval(context_score=None), _Eval(context_score=None)]
    summary = summarize(rows)
    assert summary.context.sample_size == 1
    assert summary.context.pass_rate == 100.0


def test_empty_sample_reports_none_not_zero() -> None:
    """표본이 없으면 0%가 아니라 '데이터 없음'이다."""
    summary = summarize([])
    assert summary.relevance.sample_size == 0
    assert summary.relevance.pass_rate is None
    assert summary.relevance.average is None


def test_average_is_reported_alongside_pass_rate() -> None:
    rows = [_Eval(relevance_score=60), _Eval(relevance_score=100)]
    summary = summarize(rows)
    assert summary.relevance.average == 80.0
    assert summary.relevance.pass_rate == 50.0


def test_topic_drift_is_a_rate_not_a_pass_rate() -> None:
    """이탈은 낮을수록 좋다. 발생 비율로 센다."""
    rows = [_Eval(topic_drift=True), _Eval(), _Eval(), _Eval()]
    summary = summarize(rows)
    assert summary.topic_drift_rate == 25.0


def test_review_count_and_method_breakdown() -> None:
    rows = [
        _Eval(needs_review=True, method="rule"),
        _Eval(method="llm"),
        _Eval(method="failed"),
    ]
    summary = summarize(rows)
    assert summary.needs_review_count == 1
    assert summary.llm_count == 1
    assert summary.rule_count == 1
    assert summary.failed_count == 1
    assert summary.total == 3


# ── 주간 버킷 ────────────────────────────────────────────────────────────────

from datetime import UTC, datetime  # noqa: E402

from app.services.quality.evaluation_aggregate import (  # noqa: E402
    MIN_RELIABLE_SAMPLE,
    summarize_by_week,
)


class _TimedEval(_Eval):
    def __init__(self, evaluated_at, **kw):
        super().__init__(**kw)
        self.evaluated_at = evaluated_at


def test_weekly_buckets_group_by_monday() -> None:
    """2026-08-05(수)와 2026-08-07(금)은 같은 주(월요일 08-03)에 묶인다."""
    rows = [
        _TimedEval(datetime(2026, 8, 5, 10, tzinfo=UTC), relevance_score=90),
        _TimedEval(datetime(2026, 8, 7, 10, tzinfo=UTC), relevance_score=50),
        _TimedEval(datetime(2026, 8, 11, 10, tzinfo=UTC), relevance_score=90),
    ]
    buckets = summarize_by_week(rows)
    assert [b.bucket_start for b in buckets] == ["2026-08-03", "2026-08-10"]
    assert buckets[0].relevance.sample_size == 2
    assert buckets[0].relevance.pass_rate == 50.0


def test_small_bucket_is_flagged_unreliable() -> None:
    """표본이 적으면 수치가 흔들린다. 화면에서 흐리게 처리하도록 표시한다."""
    rows = [_TimedEval(datetime(2026, 8, 5, tzinfo=UTC), relevance_score=90)]
    buckets = summarize_by_week(rows)
    assert buckets[0].reliable is False
    assert MIN_RELIABLE_SAMPLE == 30


def test_large_bucket_is_reliable() -> None:
    rows = [
        _TimedEval(datetime(2026, 8, 5, tzinfo=UTC), relevance_score=90)
        for _ in range(MIN_RELIABLE_SAMPLE)
    ]
    assert summarize_by_week(rows)[0].reliable is True
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.quality.evaluation_aggregate'`

- [ ] **Step 3: 구현**

`apps/api/app/services/quality/evaluation_aggregate.py`

```python
"""충족률 집계. 순수 함수.

표시값은 평균이 아니라 '기준선 이상을 받은 비율'이다. 평균은 꼬리를 숨긴다 —
90%가 100점이고 10%가 42점이면 평균 94.2로 훌륭해 보이지만 열 건 중 하나가 불량이다.
평균은 보조 지표로 함께 낸다.
"""

from dataclasses import dataclass
from typing import Any

# 고정값. 기관별 설정으로 두면 임계값을 낮춰 점수를 올릴 수 있어 비교가 무너진다.
PASS_THRESHOLD = 70


@dataclass
class MetricSummary:
    sample_size: int = 0
    pass_rate: float | None = None   # 표본 0이면 None ("데이터 없음")
    average: float | None = None


@dataclass
class EvaluationSummary:
    total: int = 0
    relevance: MetricSummary = None            # type: ignore[assignment]
    groundedness: MetricSummary = None         # type: ignore[assignment]
    context: MetricSummary = None              # type: ignore[assignment]
    followup: MetricSummary = None             # type: ignore[assignment]
    topic_drift_rate: float | None = None
    needs_review_count: int = 0
    llm_count: int = 0
    rule_count: int = 0
    failed_count: int = 0


def _summarize_metric(scores: list[int]) -> MetricSummary:
    if not scores:
        return MetricSummary()
    passed = sum(1 for s in scores if s >= PASS_THRESHOLD)
    return MetricSummary(
        sample_size=len(scores),
        pass_rate=round(passed / len(scores) * 100, 1),
        average=round(sum(scores) / len(scores), 1),
    )


def _collect(rows: list[Any], attr: str) -> list[int]:
    """NULL은 분모에서 제외한다."""
    return [getattr(r, attr) for r in rows if getattr(r, attr, None) is not None]


def summarize(rows: list[Any]) -> EvaluationSummary:
    summary = EvaluationSummary(total=len(rows))
    summary.relevance = _summarize_metric(_collect(rows, "relevance_score"))
    summary.groundedness = _summarize_metric(_collect(rows, "groundedness_score"))
    summary.context = _summarize_metric(_collect(rows, "context_score"))
    summary.followup = _summarize_metric(_collect(rows, "followup_score"))

    if rows:
        drifted = sum(1 for r in rows if getattr(r, "topic_drift", False))
        summary.topic_drift_rate = round(drifted / len(rows) * 100, 1)

    summary.needs_review_count = sum(1 for r in rows if getattr(r, "needs_review", False))
    summary.llm_count = sum(1 for r in rows if getattr(r, "method", "") == "llm")
    summary.rule_count = sum(1 for r in rows if getattr(r, "method", "") == "rule")
    summary.failed_count = sum(1 for r in rows if getattr(r, "method", "") == "failed")
    return summary


# ── 주간 버킷 ────────────────────────────────────────────────────────────────
# 실측 이용량이 챗봇당 하루 6건 수준이다. 일별로 보면 1건 틀릴 때마다 수치가
# 크게 흔들려 품질 변화가 아니라 표본 노이즈를 보게 된다. 주 단위로 묶는다.

from datetime import date, timedelta  # noqa: E402

MIN_RELIABLE_SAMPLE = 30


@dataclass
class WeeklyBucket:
    bucket_start: str        # 그 주 월요일 (YYYY-MM-DD)
    total: int
    reliable: bool           # 표본이 충분한가 — 부족하면 화면에서 흐리게 표시
    relevance: MetricSummary
    groundedness: MetricSummary
    context: MetricSummary


def _week_start(value: Any) -> str:
    d: date = value.date() if hasattr(value, "date") else value
    return (d - timedelta(days=d.weekday())).isoformat()


def summarize_by_week(rows: list[Any]) -> list[WeeklyBucket]:
    grouped: dict[str, list[Any]] = {}
    for row in rows:
        grouped.setdefault(_week_start(row.evaluated_at), []).append(row)

    buckets: list[WeeklyBucket] = []
    for start in sorted(grouped):
        items = grouped[start]
        buckets.append(
            WeeklyBucket(
                bucket_start=start,
                total=len(items),
                reliable=len(items) >= MIN_RELIABLE_SAMPLE,
                relevance=_summarize_metric(_collect(items, "relevance_score")),
                groundedness=_summarize_metric(_collect(items, "groundedness_score")),
                context=_summarize_metric(_collect(items, "context_score")),
            )
        )
    return buckets
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quality_evaluation.py -v`
Expected: PASS (31 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/app/services/quality/evaluation_aggregate.py apps/api/tests/test_quality_evaluation.py
git commit -m "feat(quality): 충족률 집계 + 주간 버킷 (NULL 제외, 임계값 70 고정)"
```

---

## Task 7: 리포지터리

**Files:**
- Create: `apps/api/app/repositories/quality/__init__.py` (빈 파일)
- Create: `apps/api/app/repositories/quality/answer_evaluation_repository.py`

- [ ] **Step 1: 구현**

`apps/api/app/repositories/quality/__init__.py` — 빈 파일.

`apps/api/app/repositories/quality/answer_evaluation_repository.py`

```python
"""answer_evaluations DB 접근."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnswerEvaluation, ChatMessage


def list_evaluations(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None,
    start_at: datetime,
    end_at: datetime,
) -> list[AnswerEvaluation]:
    stmt = select(AnswerEvaluation).where(
        AnswerEvaluation.organization_id == uuid.UUID(organization_id),
        AnswerEvaluation.evaluated_at >= start_at,
        AnswerEvaluation.evaluated_at < end_at,
    )
    if chatbot_id:
        stmt = stmt.where(AnswerEvaluation.chatbot_id == uuid.UUID(chatbot_id))
    return list(db.execute(stmt).scalars().all())


def list_review_needed(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None,
    start_at: datetime,
    end_at: datetime,
    limit: int = 50,
) -> list[AnswerEvaluation]:
    stmt = (
        select(AnswerEvaluation)
        .where(
            AnswerEvaluation.organization_id == uuid.UUID(organization_id),
            AnswerEvaluation.needs_review.is_(True),
            AnswerEvaluation.evaluated_at >= start_at,
            AnswerEvaluation.evaluated_at < end_at,
        )
        .order_by(AnswerEvaluation.evaluated_at.desc())
        .limit(limit)
    )
    if chatbot_id:
        stmt = stmt.where(AnswerEvaluation.chatbot_id == uuid.UUID(chatbot_id))
    return list(db.execute(stmt).scalars().all())


def list_unevaluated_messages(
    db: Session,
    *,
    chatbot_id: str,
    start_at: datetime,
    end_at: datetime,
    limit: int,
) -> list[ChatMessage]:
    """아직 평가되지 않은 assistant 메시지. 세부 제외 규칙은 selector가 판단한다."""
    evaluated = select(AnswerEvaluation.message_id)
    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.chatbot_id == uuid.UUID(chatbot_id),
            ChatMessage.role == "assistant",
            ChatMessage.is_test.is_(False),
            ChatMessage.created_at >= start_at,
            ChatMessage.created_at < end_at,
            ChatMessage.id.not_in(evaluated),
        )
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def count_evaluated_since(db: Session, *, organization_id: str, since: datetime) -> int:
    """일일 상한 확인용."""
    stmt = select(AnswerEvaluation.id).where(
        AnswerEvaluation.organization_id == uuid.UUID(organization_id),
        AnswerEvaluation.evaluated_at >= since,
    )
    return len(list(db.execute(stmt).scalars().all()))


def insert_evaluation(db: Session, *, row: AnswerEvaluation) -> None:
    db.add(row)
```

- [ ] **Step 2: import 확인**

Run: `cd apps/api && python -c "from app.repositories.quality.answer_evaluation_repository import list_evaluations; print('ok')"`
Expected: `ok`

- [ ] **Step 3: 커밋**

```bash
git add apps/api/app/repositories/quality/
git commit -m "feat(quality): answer_evaluations 리포지터리"
```

---

## Task 8: 평가 배치 서비스

DB와 LLM을 붙이는 오케스트레이션.

**Files:**
- Create: `apps/api/app/services/quality/evaluation_service.py`

- [ ] **Step 1: 구현**

`apps/api/app/services/quality/evaluation_service.py`

```python
"""평가 배치 오케스트레이션.

동기 함수다. 워커에서 부를 때 반드시 asyncio.to_thread로 감싼다 —
LLM 클라이언트가 동기라 이벤트 루프에서 직접 부르면 워커 전체가 멈춘다
(2026-07-31 API 정지와 같은 원인).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models import AnswerEvaluation, ChatbotSetting
from app.repositories.quality.answer_evaluation_repository import (
    count_evaluated_since,
    insert_evaluation,
    list_unevaluated_messages,
)
from app.services.quality.evaluation_prompt import (
    PROMPT_VERSION,
    build_evaluation_prompt,
    parse_evaluation_response,
    system_prompt,
)
from app.services.quality.evaluation_rules import apply_rules
from app.services.quality.evaluation_selector import should_evaluate

logger = logging.getLogger(__name__)

DAILY_LIMIT_PER_ORG = 5000
_MAX_PARSE_RETRY = 1
_MAX_CALL_RETRY = 3
_CALL_TIMEOUT_SEC = 30.0
# 상위 모델 단가(1M 토큰당 USD). 모델 가격이 바뀌면 여기만 고친다.
_USD_PER_1M_INPUT = Decimal("2.00")
_USD_PER_1M_OUTPUT = Decimal("8.00")


def _cost_usd(input_tokens: int, output_tokens: int) -> Decimal:
    return (
        Decimal(input_tokens) / Decimal(1_000_000) * _USD_PER_1M_INPUT
        + Decimal(output_tokens) / Decimal(1_000_000) * _USD_PER_1M_OUTPUT
    ).quantize(Decimal("0.000001"))


def _is_faq(message: Any) -> bool:
    return (message.final_decision or {}).get("reason") == "faq_match"


def _is_out_of_scope(message: Any) -> bool:
    return (message.classification_result or {}).get("detectedIntent") == "out_of_scope"


def _followups(message: Any) -> list[str]:
    meta = message.metadata_json or {}
    values = meta.get("followUpQuestions") or []
    return [str(v) for v in values if str(v).strip()]


def _previous_turn(db: Session, *, message: Any) -> str | None:
    """직전 사용자 질문 1건. 맥락 유지 채점에 쓴다."""
    from app.models import ChatMessage  # noqa: PLC0415
    from sqlalchemy import select  # noqa: PLC0415

    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.session_id == message.session_id,
            ChatMessage.created_at < message.created_at,
            ChatMessage.role == "user",
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(2)
    )
    rows = list(db.execute(stmt).scalars().all())
    # 가장 최근 user는 이 답변의 질문이다. 그 이전 것이 '직전 대화'.
    return rows[1].content if len(rows) > 1 else None


def _call_evaluator(db: Session, *, system: str, user: str) -> tuple[str, int, int, str]:
    """평가 모델 호출. (본문, input_tokens, output_tokens, model) 반환.

    provider가 openai/anthropic 어느 쪽이든 동작해야 한다. query_rewriter_service가
    쓰는 것과 같은 provider 분기 패턴을 따른다.
    """
    from app.services.chat.answer_generation_service import (  # noqa: PLC0415
        _anthropic_usage,
        _call_anthropic,
        _call_openai_like,
        _extract_output_text_anthropic,
        _extract_output_text_openai,
        _openai_usage,
    )
    from app.services.llm_api_config_runtime_service import (  # noqa: PLC0415
        resolve_runtime_api_config,
    )

    runtime = resolve_runtime_api_config(db)
    if runtime is None:
        raise RuntimeError("LLM_RUNTIME_CONFIG_MISSING")

    # 채점은 상위 모델로 한다 — 채점 정확도가 통계 신뢰도를 결정한다.
    # quality_model()은 미설정 시 gpt-4.1(또는 claude-sonnet-4-6)을 돌려준다.
    model = runtime.quality_model()

    if runtime.provider == "anthropic":
        response_json = _call_anthropic(
            api_key=runtime.api_key,
            base_url=runtime.base_url,
            model=model,
            temperature=0,
            max_output_tokens=700,
            top_p=None,
            system_prompt=system,
            user_prompt=user,
            timeout_seconds=_CALL_TIMEOUT_SEC,
        )
        text = _extract_output_text_anthropic(response_json)
        input_tokens, output_tokens, _ = _anthropic_usage(response_json)
    else:
        response_json = _call_openai_like(
            provider=runtime.provider,
            api_key=runtime.api_key,
            base_url=runtime.base_url,
            model=model,
            temperature=0,
            max_output_tokens=700,
            top_p=None,
            frequency_penalty=None,
            presence_penalty=None,
            system_prompt=system,
            user_prompt=user,
            timeout_seconds=_CALL_TIMEOUT_SEC,
        )
        text = _extract_output_text_openai(response_json)
        input_tokens, output_tokens, _ = _openai_usage(response_json)

    return text, input_tokens, output_tokens, model


def evaluate_chatbot_range(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    start_at: datetime,
    end_at: datetime,
    limit: int = DAILY_LIMIT_PER_ORG,
) -> dict[str, int]:
    """한 챗봇의 기간 내 미평가 답변을 채점한다. 야간 배치와 소급 평가가 같이 쓴다."""
    used_today = count_evaluated_since(
        db, organization_id=organization_id, since=datetime.now(UTC) - timedelta(days=1)
    )
    remaining = max(0, DAILY_LIMIT_PER_ORG - used_today)
    if remaining == 0:
        logger.warning("[QUALITY_EVAL] daily limit reached org=%s", organization_id)
        return {"evaluated": 0, "skipped": 0, "failed": 0, "limited": 1}

    messages = list_unevaluated_messages(
        db, chatbot_id=chatbot_id, start_at=start_at, end_at=end_at, limit=min(limit, remaining)
    )

    evaluated = skipped = failed = 0
    for message in messages:
        if should_evaluate(message) is not None:
            skipped += 1
            continue
        try:
            _evaluate_one(db, organization_id=organization_id, message=message)
            evaluated += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("[QUALITY_EVAL] failed message=%s: %s", message.id, exc)
            _record_failed(db, organization_id=organization_id, message=message)
            failed += 1
        # 건별 커밋 — 중간에 끊겨도 재실행 시 이어서 진행한다.
        db.commit()

    logger.info(
        "[QUALITY_EVAL] chatbot=%s evaluated=%d skipped=%d failed=%d",
        chatbot_id, evaluated, skipped, failed,
    )
    return {"evaluated": evaluated, "skipped": skipped, "failed": failed, "limited": 0}


def _base_row(organization_id: str, message: Any) -> AnswerEvaluation:
    return AnswerEvaluation(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=message.chatbot_id,
        message_id=message.id,
        session_id=message.session_id,
        evaluated_at=datetime.now(UTC),
        prompt_version=PROMPT_VERSION,
    )


def _record_failed(db: Session, *, organization_id: str, message: Any) -> None:
    row = _base_row(organization_id, message)
    row.method = "failed"
    row.verdict_json = {"error": "evaluation_failed"}
    insert_evaluation(db, row=row)


def _evaluate_one(db: Session, *, organization_id: str, message: Any) -> None:
    sources = message.selected_sources or []
    followups = _followups(message)
    pre = apply_rules(
        selected_sources=sources,
        is_faq=_is_faq(message),
        followups=followups,
        is_out_of_scope=_is_out_of_scope(message),
    )

    row = _base_row(organization_id, message)
    row.groundedness_score = pre.groundedness_score
    row.followup_score = pre.followup_score
    row.topic_drift = pre.topic_drift
    row.needs_review = pre.needs_review
    verdict: dict[str, Any] = dict(pre.reasons)

    if pre.decided_fully:
        row.method = "rule"
        row.verdict_json = verdict
        insert_evaluation(db, row=row)
        return

    question = message.normalized_query or ""
    user_prompt = build_evaluation_prompt(
        question=question,
        answer=message.content or "",
        sources=sources,
        previous_turn=_previous_turn(db, message=message),
        followups=followups,
    )

    parsed = None
    last_error: Exception | None = None
    input_tokens = output_tokens = 0
    model = None
    for _ in range(_MAX_CALL_RETRY):
        try:
            text, input_tokens, output_tokens, model = _call_evaluator(
                db, system=system_prompt(), user=user_prompt
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
        parsed = parse_evaluation_response(text)
        if parsed is not None:
            break
        # 파싱 실패는 1회만 재요청한다.
        for _retry in range(_MAX_PARSE_RETRY):
            text, input_tokens, output_tokens, model = _call_evaluator(
                db, system=system_prompt(), user=user_prompt
            )
            parsed = parse_evaluation_response(text)
            if parsed is not None:
                break
        break

    if parsed is None:
        raise last_error or RuntimeError("EVALUATION_PARSE_FAILED")

    row.method = "llm"
    row.evaluator_model = model
    row.relevance_score = parsed.relevance_score
    row.context_score = parsed.context_score
    if pre.groundedness_score is None:
        row.groundedness_score = parsed.groundedness_score
    if not pre.followup_decided:
        row.followup_score = parsed.followup_score
    row.topic_drift = pre.topic_drift or parsed.topic_drift

    from app.services.quality.evaluation_aggregate import PASS_THRESHOLD  # noqa: PLC0415

    row.needs_review = bool(
        pre.needs_review
        or row.topic_drift
        or (row.relevance_score is not None and row.relevance_score < PASS_THRESHOLD)
        or (row.groundedness_score is not None and row.groundedness_score < PASS_THRESHOLD)
    )

    verdict.update(parsed.reasons)
    row.verdict_json = verdict
    row.input_tokens = input_tokens
    row.output_tokens = output_tokens
    row.cost_usd = _cost_usd(input_tokens, output_tokens)
    insert_evaluation(db, row=row)


def enabled_chatbot_ids(db: Session) -> list[tuple[str, str]]:
    """품질 평가를 켠 챗봇의 (organization_id, chatbot_id) 목록."""
    from sqlalchemy import select  # noqa: PLC0415

    rows = list(db.execute(select(ChatbotSetting)).scalars().all())
    result: list[tuple[str, str]] = []
    for row in rows:
        policy = (row.answer_settings_json or {}).get("answerPolicy") or {}
        if policy.get("qualityEvaluationEnabled") is True:
            result.append((str(row.organization_id), str(row.id)))
    return result
```

- [ ] **Step 2: import 확인**

Run: `cd apps/api && python -c "from app.services.quality.evaluation_service import evaluate_chatbot_range; print('ok')"`
Expected: `ok`

- [ ] **Step 3: 전체 테스트 확인 (회귀 없음)**

Run: `cd apps/api && python -m pytest tests/ -q`
Expected: 기존 테스트 전부 PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/api/app/services/quality/evaluation_service.py
git commit -m "feat(quality): 평가 배치 서비스 (규칙 선판정 + LLM 채점)"
```

---

## Task 9: 워커 크론 등록

**Files:**
- Modify: `apps/api/app/workers/main.py`

- [ ] **Step 1: 작업 함수 추가**

`apps/api/app/workers/main.py` 의 `sync_due_web_sources` 함수 정의 바로 아래에 추가한다.

```python
async def evaluate_answer_quality(ctx: dict) -> dict[str, Any]:
    """전날 답변의 품질을 채점한다(cron). 품질 평가를 켠 챗봇만 대상.

    평가 서비스는 동기 함수다 — LLM 클라이언트가 동기라 이벤트 루프에서 직접
    부르면 워커 전체가 멈춘다. 반드시 to_thread로 감싼다.
    """
    import asyncio
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.services.quality.evaluation_service import (
        enabled_chatbot_ids,
        evaluate_chatbot_range,
    )

    def _run() -> dict[str, int]:
        end_at = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        start_at = end_at - timedelta(days=1)
        totals = {"evaluated": 0, "skipped": 0, "failed": 0}
        db = SessionLocal()
        try:
            for organization_id, chatbot_id in enabled_chatbot_ids(db):
                result = evaluate_chatbot_range(
                    db,
                    organization_id=organization_id,
                    chatbot_id=chatbot_id,
                    start_at=start_at,
                    end_at=end_at,
                )
                for key in totals:
                    totals[key] += result.get(key, 0)
        finally:
            db.close()
        return totals

    logger.info("[ARQ_CRON] evaluate_answer_quality started")
    try:
        totals = await asyncio.to_thread(_run)
        logger.info("[ARQ_CRON] evaluate_answer_quality done %s", totals)
        return {"status": "ok", **totals}
    except Exception as exc:
        logger.exception("[ARQ_CRON] evaluate_answer_quality failed: %s", exc)
        return {"status": "error"}
```

- [ ] **Step 2: WorkerSettings 등록**

`functions` 리스트에 `evaluate_answer_quality` 를 추가한다.

```python
    functions = [process_reindex_job, sync_due_web_sources, evaluate_answer_quality]
```

`cron_jobs` 리스트에 추가한다. 컨테이너 TZ가 Asia/Seoul이라 hour=3이 곧 새벽 3시다.

```python
        cron(evaluate_answer_quality, hour=3, minute=10, run_at_startup=False),
```

- [ ] **Step 3: 등록 확인**

Run: `cd apps/api && python -c "from app.workers.main import WorkerSettings; print([f.__name__ for f in WorkerSettings.functions]); print(len(WorkerSettings.cron_jobs))"`
Expected: `evaluate_answer_quality`가 목록에 있고 cron_jobs 길이가 2

- [ ] **Step 4: 커밋**

```bash
git add apps/api/app/workers/main.py
git commit -m "feat(quality): 야간 품질 평가 크론 등록"
```

---

## Task 10: 품질 리포트 API 확장

**Files:**
- Modify: `apps/api/app/schemas/admin_operations.py`
- Modify: `apps/api/app/services/admin/operations_service.py:421-515`
- Modify: `apps/api/app/api/admin/operations_router.py:115-125`

- [ ] **Step 1: 응답 스키마 추가**

`apps/api/app/schemas/admin_operations.py` 의 `AdminQualityReportResponse` 정의 **바로 위**에
추가한다.

```python
class AdminQualityMetricItem(ApiSchema):
    sample_size: int
    pass_rate: float | None = None   # 표본 0이면 None ("데이터 없음")
    average: float | None = None


class AdminQualityReviewItem(ApiSchema):
    message_id: str
    session_id: str | None = None
    evaluated_at: str
    question: str
    failed_metrics: list[str]
    reasons: dict[str, str]


class AdminQualityWeeklyItem(ApiSchema):
    bucket_start: str
    total: int
    reliable: bool           # false면 표본 부족 — 화면에서 흐리게
    relevance_pass_rate: float | None = None
    groundedness_pass_rate: float | None = None
    context_pass_rate: float | None = None


class AdminAnswerQualityBlock(ApiSchema):
    """AI 채점 결과. 위쪽 운영 지표(챗봇 자체 판정)와 성격이 다르다."""

    enabled: bool
    total: int
    weekly: list[AdminQualityWeeklyItem] = []
    relevance: AdminQualityMetricItem
    groundedness: AdminQualityMetricItem
    context: AdminQualityMetricItem
    followup: AdminQualityMetricItem
    topic_drift_rate: float | None = None
    needs_review_count: int
    llm_count: int
    rule_count: int
    failed_count: int
    evaluator_model: str | None = None
    prompt_version: str | None = None
    cost_usd_total: float = 0.0
    review_items: list[AdminQualityReviewItem] = []
```

`AdminQualityReportResponse` 클래스 마지막 줄(`no_citation_answers` 다음)에 추가한다.

```python
    answer_quality: AdminAnswerQualityBlock | None = None
```

- [ ] **Step 2: 서비스에 집계 병합**

`apps/api/app/services/admin/operations_service.py` 파일 끝에 헬퍼를 추가한다.

```python
def _build_answer_quality_block(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None,
    start_dt: datetime,
    end_dt: datetime,
) -> "AdminAnswerQualityBlock":
    """AI 채점 집계. 기능이 꺼져 있으면 enabled=False 만 채워 돌려준다."""
    from app.repositories.quality.answer_evaluation_repository import (  # noqa: PLC0415
        list_evaluations,
        list_review_needed,
    )
    from app.schemas.admin_operations import (  # noqa: PLC0415
        AdminAnswerQualityBlock,
        AdminQualityMetricItem,
        AdminQualityReviewItem,
        AdminQualityWeeklyItem,
    )
    from app.services.quality.evaluation_aggregate import (  # noqa: PLC0415
        PASS_THRESHOLD,
        summarize,
        summarize_by_week,
    )

    rows = list_evaluations(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        start_at=start_dt,
        end_at=end_dt,
    )
    summary = summarize(rows)

    def _metric(item) -> AdminQualityMetricItem:
        return AdminQualityMetricItem(
            sample_size=item.sample_size, pass_rate=item.pass_rate, average=item.average
        )

    review_rows = list_review_needed(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        start_at=start_dt,
        end_at=end_dt,
    )
    review_items: list[AdminQualityReviewItem] = []
    for row in review_rows:
        failed: list[str] = []
        if row.relevance_score is not None and row.relevance_score < PASS_THRESHOLD:
            failed.append(f"적합성 {row.relevance_score}")
        if row.groundedness_score is not None and row.groundedness_score < PASS_THRESHOLD:
            failed.append(f"근거성 {row.groundedness_score}")
        if row.topic_drift:
            failed.append("주제 이탈")
        message = db.get(ChatMessage, row.message_id)
        review_items.append(
            AdminQualityReviewItem(
                message_id=str(row.message_id),
                session_id=str(row.session_id) if row.session_id else None,
                evaluated_at=row.evaluated_at.isoformat(),
                question=(message.normalized_query if message else "") or "",
                failed_metrics=failed,
                reasons=dict(row.verdict_json or {}),
            )
        )

    weekly = [
        AdminQualityWeeklyItem(
            bucket_start=b.bucket_start,
            total=b.total,
            reliable=b.reliable,
            relevance_pass_rate=b.relevance.pass_rate,
            groundedness_pass_rate=b.groundedness.pass_rate,
            context_pass_rate=b.context.pass_rate,
        )
        for b in summarize_by_week(rows)
    ]

    latest = rows[-1] if rows else None
    return AdminAnswerQualityBlock(
        enabled=bool(rows),
        total=summary.total,
        weekly=weekly,
        relevance=_metric(summary.relevance),
        groundedness=_metric(summary.groundedness),
        context=_metric(summary.context),
        followup=_metric(summary.followup),
        topic_drift_rate=summary.topic_drift_rate,
        needs_review_count=summary.needs_review_count,
        llm_count=summary.llm_count,
        rule_count=summary.rule_count,
        failed_count=summary.failed_count,
        evaluator_model=latest.evaluator_model if latest else None,
        prompt_version=latest.prompt_version if latest else None,
        cost_usd_total=float(sum((r.cost_usd or 0) for r in rows)),
        review_items=review_items,
    )
```

`get_quality_report_service` 의 `return AdminQualityReportResponse(` 블록 마지막 인자
(`no_citation_answers=[...]` 다음)에 추가한다.

```python
        answer_quality=_build_answer_quality_block(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            start_dt=start_dt,
            end_dt=end_dt,
        ),
```

- [ ] **Step 3: 소급 평가 엔드포인트 추가**

`apps/api/app/api/admin/operations_router.py` 의 `admin_quality_report` 함수 **아래**에
추가한다. 기존 import 블록에 필요한 스키마를 함께 추가한다.

```python
class QualityBackfillEstimate(ApiSchema):
    target_count: int
    estimated_cost_usd: float


class QualityBackfillResult(ApiSchema):
    evaluated: int
    skipped: int
    failed: int


@router.get("/quality-report/backfill/estimate", response_model=QualityBackfillEstimate)
def admin_quality_backfill_estimate(
    chatbot_id: str,
    start_date: str,
    end_date: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> QualityBackfillEstimate:
    """소급 평가 대상 건수와 예상 비용. 실행 전에 반드시 보여준다."""
    from datetime import datetime

    from app.repositories.quality.answer_evaluation_repository import (
        list_unevaluated_messages,
    )
    from app.services.quality.evaluation_service import DAILY_LIMIT_PER_ORG

    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    start_at = datetime.fromisoformat(start_date)
    end_at = datetime.fromisoformat(end_date)
    rows = list_unevaluated_messages(
        db, chatbot_id=chatbot_id, start_at=start_at, end_at=end_at, limit=DAILY_LIMIT_PER_ORG
    )
    # 건당 입력 2,500 / 출력 300 토큰 가정
    per_item = 2500 / 1_000_000 * 2.00 + 300 / 1_000_000 * 8.00
    return QualityBackfillEstimate(
        target_count=len(rows), estimated_cost_usd=round(len(rows) * per_item, 2)
    )


@router.post("/quality-report/backfill", response_model=QualityBackfillResult)
def admin_quality_backfill(
    chatbot_id: str,
    start_date: str,
    end_date: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> QualityBackfillResult:
    """지정 기간 소급 평가. 이미 평가된 건은 UNIQUE 제약으로 자동 제외된다."""
    from datetime import datetime

    from app.services.quality.evaluation_service import evaluate_chatbot_range

    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    organization_id = require_institution_organization_id(principal)
    result = evaluate_chatbot_range(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        start_at=datetime.fromisoformat(start_date),
        end_at=datetime.fromisoformat(end_date),
    )
    return QualityBackfillResult(
        evaluated=result["evaluated"], skipped=result["skipped"], failed=result["failed"]
    )
```

- [ ] **Step 4: 라우트 등록 확인**

Run:
```bash
cd apps/api && PYTHONIOENCODING=utf-8 python -c "
from app.main import app
for r in app.routes:
    p = getattr(r,'path','')
    if 'quality' in p: print(sorted(getattr(r,'methods',[]) or []), p)
"
```
Expected: `/api/admin/quality-report`, `/api/admin/quality-report/backfill`,
`/api/admin/quality-report/backfill/estimate` 세 개가 보인다

- [ ] **Step 5: 쿼리 파라미터 계약 확인**

프론트엔드가 보낼 이름과 서버가 받는 이름이 어긋나면 422가 난다(과거 실제 발생).
OpenAPI로 직접 확인한다.

Run:
```bash
cd apps/api && PYTHONIOENCODING=utf-8 python -c "
from app.main import app
spec = app.openapi()['paths']['/api/admin/quality-report/backfill']['post']
print([(p['name'], p['in'], p['required']) for p in spec.get('parameters', [])])
"
```
Expected: `[('chatbot_id', 'query', True), ('start_date', 'query', True), ('end_date', 'query', True)]`

- [ ] **Step 6: 전체 테스트**

Run: `cd apps/api && python -m pytest tests/ -q`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add apps/api/app/schemas/admin_operations.py apps/api/app/services/admin/operations_service.py apps/api/app/api/admin/operations_router.py
git commit -m "feat(quality): 품질 리포트 API에 AI 채점 집계 + 소급 평가 엔드포인트"
```

---

## Task 11: 프론트엔드 타입 + API 함수

**Files:**
- Modify: `apps/web/lib/api/admin-operations-types.ts`
- Modify: `apps/web/lib/api/admin-operations.ts`

- [ ] **Step 1: 타입 추가**

`apps/web/lib/api/admin-operations-types.ts` 의 `AdminQualityReportResponse` 타입 **위**에
추가한다.

```typescript
export type AdminQualityMetricItem = {
  sampleSize: number;
  passRate: number | null;   // 표본 0이면 null — 0%가 아니라 "데이터 없음"
  average: number | null;
};

export type AdminQualityReviewItem = {
  messageId: string;
  sessionId: string | null;
  evaluatedAt: string;
  question: string;
  failedMetrics: string[];
  reasons: Record<string, string>;
};

export type AdminQualityWeeklyItem = {
  bucketStart: string;
  total: number;
  reliable: boolean;   // false면 표본 부족 — 흐리게 표시
  relevancePassRate: number | null;
  groundednessPassRate: number | null;
  contextPassRate: number | null;
};

export type AdminAnswerQualityBlock = {
  enabled: boolean;
  total: number;
  weekly: AdminQualityWeeklyItem[];
  relevance: AdminQualityMetricItem;
  groundedness: AdminQualityMetricItem;
  context: AdminQualityMetricItem;
  followup: AdminQualityMetricItem;
  topicDriftRate: number | null;
  needsReviewCount: number;
  llmCount: number;
  ruleCount: number;
  failedCount: number;
  evaluatorModel: string | null;
  promptVersion: string | null;
  costUsdTotal: number;
  reviewItems: AdminQualityReviewItem[];
};
```

`AdminQualityReportResponse` 타입 안에 필드를 추가한다.

```typescript
  answerQuality?: AdminAnswerQualityBlock | null;
```

- [ ] **Step 2: API 함수 추가**

`apps/web/lib/api/admin-operations.ts` 의 `getAdminQualityReport` 함수 **아래**에 추가한다.

```typescript
export type QualityBackfillEstimate = { targetCount: number; estimatedCostUsd: number };
export type QualityBackfillResult = { evaluated: number; skipped: number; failed: number };

/** 소급 평가 대상 건수와 예상 비용. 실행 전 확인용. */
export async function estimateQualityBackfill(
  chatbotId: string,
  startDate: string,
  endDate: string,
): Promise<QualityBackfillEstimate> {
  const params = new URLSearchParams({
    chatbot_id: chatbotId,
    start_date: startDate,
    end_date: endDate,
  });
  return apiClient.request<QualityBackfillEstimate>(
    `/admin/quality-report/backfill/estimate?${params}`,
  );
}

/** 지정 기간 소급 평가 실행. 이미 평가된 건은 서버에서 건너뛴다. */
export async function runQualityBackfill(
  chatbotId: string,
  startDate: string,
  endDate: string,
): Promise<QualityBackfillResult> {
  const params = new URLSearchParams({
    chatbot_id: chatbotId,
    start_date: startDate,
    end_date: endDate,
  });
  return apiClient.request<QualityBackfillResult>(`/admin/quality-report/backfill?${params}`, {
    method: "POST",
  });
}
```

- [ ] **Step 3: 타입 검사**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --project tsconfig.json --noEmit`
Expected: 출력 없음 (통과)

- [ ] **Step 4: 커밋**

```bash
git add apps/web/lib/api/admin-operations-types.ts apps/web/lib/api/admin-operations.ts
git commit -m "feat(quality): 프론트 품질 평가 타입·API 함수"
```

---

## Task 12: 활성화 토글 UI

**Files:**
- Modify: `apps/web/app/admin/ai/style/page.tsx`

- [ ] **Step 1: 폼 타입에 필드 추가**

`StyleForm` 타입에서 `suggestNextQuestion: boolean;` 아래에 추가한다.

```typescript
  qualityEvaluationEnabled: boolean;
```

- [ ] **Step 2: 기본값 추가**

`DEFAULT_FORM` 에서 `suggestNextQuestion: false,` 다음에 추가한다.

```typescript
  qualityEvaluationEnabled: false,
```

- [ ] **Step 3: 서버 값 로드**

`suggestNextQuestion: settings.settings.answerPolicy.suggestNextQuestion ?? false,` 아래에
추가한다.

```typescript
        qualityEvaluationEnabled:
          settings.settings.answerPolicy.qualityEvaluationEnabled ?? false,
```

- [ ] **Step 4: 저장 시 반영**

`next.answerPolicy.suggestNextQuestion = form.suggestNextQuestion;` 아래에 추가한다.

```typescript
      next.answerPolicy.qualityEvaluationEnabled = form.qualityEvaluationEnabled;
```

- [ ] **Step 5: 토글 렌더**

`"이어서 안내 제안 문장"` ToggleField 바로 아래에 추가한다.

```tsx
              <ToggleField label="답변 품질 자동 평가" description="매일 새벽 전날 답변을 상위 AI로 채점해 적합성·근거성 등을 품질 리포트에 표시합니다. 경영평가·품질관리용이며, 켠 기관에만 평가 비용(답변 1건당 약 9원)이 발생합니다." checked={form.qualityEvaluationEnabled} onChange={v => setForm(p => ({ ...p, qualityEvaluationEnabled: v }))} />
```

- [ ] **Step 6: 프론트 타입에 설정 필드 추가**

`apps/web/lib/api/answer-settings-types.ts` 의 `AnswerPolicySettings` 에서
`suggestNextQuestion: boolean;` 아래에 추가한다.

```typescript
  qualityEvaluationEnabled: boolean;
```

- [ ] **Step 7: 타입 검사**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --project tsconfig.json --noEmit`
Expected: 출력 없음

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/admin/ai/style/page.tsx apps/web/lib/api/answer-settings-types.ts
git commit -m "feat(quality): 대화 스타일 설정에 품질 평가 활성화 토글"
```

---

## Task 13: 품질 리포트 화면 섹션 2

**Files:**
- Modify: `apps/web/app/admin/quality-report/page.tsx`

- [ ] **Step 1: 기존 섹션에 성격 안내 추가**

기존 운영 지표 카드 묶음 위에 한 줄 안내를 넣는다. 아래 AI 채점 수치와 성격이
다르다는 것을 화면에서 구분해야 "성공률 82%인데 적합성 94%?" 혼동을 막는다.

```tsx
<p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
  아래 지표는 챗봇이 스스로 남긴 처리 결과 기준입니다.
</p>
```

- [ ] **Step 2: AI 품질 섹션 렌더**

페이지 최하단(기존 목록들 다음)에 추가한다. `report` 는 기존 상태 변수명을 따른다.

```tsx
{report?.answerQuality && (
  <section style={{ marginTop: 28 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800 }}>AI 답변 품질</h2>
      <span style={{ fontSize: 12, color: "#64748b" }}>
        {report.answerQuality.evaluatorModel ?? "-"} · 기준{" "}
        {report.answerQuality.promptVersion ?? "-"} · n={report.answerQuality.total}
      </span>
    </div>

    {!report.answerQuality.enabled ? (
      <div style={{ padding: 20, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#475569" }}>
        아직 평가 결과가 없습니다. <strong>대화 스타일 설정 → 답변 품질 자동 평가</strong>를
        켜면 다음 날 새벽부터 채점이 시작됩니다. 과거 구간은 아래 소급 평가로 채울 수 있습니다.
      </div>
    ) : (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {([
            ["답변 적합성", report.answerQuality.relevance],
            ["문서 근거성", report.answerQuality.groundedness],
            ["대화 맥락 유지", report.answerQuality.context],
            ["추천질문 적합성", report.answerQuality.followup],
          ] as const).map(([label, metric]) => (
            <div key={label} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {metric.passRate === null ? "데이터 없음" : `${metric.passRate}%`}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                {metric.average === null ? "—" : `평균 ${metric.average}점`} · n={metric.sampleSize}
              </div>
            </div>
          ))}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>주제 이탈</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {report.answerQuality.topicDriftRate === null
                ? "데이터 없음"
                : `${report.answerQuality.topicDriftRate}%`}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>낮을수록 좋음</div>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>검토 필요</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {report.answerQuality.needsReviewCount}건
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
          판정 구성: AI 채점 {report.answerQuality.llmCount}건 · 규칙 확정{" "}
          {report.answerQuality.ruleCount}건 · 실패 {report.answerQuality.failedCount}건 · 지출 약{" "}
          {Math.round(report.answerQuality.costUsdTotal * 1400).toLocaleString()}원
        </p>

        {report.answerQuality.reviewItems.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>검토 필요 목록</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.answerQuality.reviewItems.map(item => (
                <div key={item.messageId} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.question || "(질문 미기록)"}</span>
                    {item.failedMetrics.map(m => (
                      <span key={m} className="badge-warning" style={{ fontSize: 11 }}>{m}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 5 }}>
                    {Object.values(item.reasons).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )}
  </section>
)}
```

- [ ] **Step 3: 주간 추이 표 렌더**

`판정 구성:` 문단 바로 아래, `검토 필요 목록` 블록 **위**에 추가한다.
차트 대신 표로 낸다 — 값이 정확히 보이고, 표본 부족 구간을 흐리게 처리하기 쉽다.

```tsx
{report.answerQuality.weekly.length > 0 && (
  <div style={{ marginTop: 18 }}>
    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>주간 추이</h3>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
          <th style={{ padding: "6px 8px" }}>주 시작</th>
          <th style={{ padding: "6px 8px" }}>건수</th>
          <th style={{ padding: "6px 8px" }}>적합성</th>
          <th style={{ padding: "6px 8px" }}>근거성</th>
          <th style={{ padding: "6px 8px" }}>맥락</th>
        </tr>
      </thead>
      <tbody>
        {report.answerQuality.weekly.map(week => (
          <tr
            key={week.bucketStart}
            style={{ borderBottom: "1px solid #f1f5f9", opacity: week.reliable ? 1 : 0.45 }}
            title={week.reliable ? undefined : "표본 30건 미만 — 신뢰하기 어려운 값입니다"}
          >
            <td style={{ padding: "6px 8px" }}>{week.bucketStart}</td>
            <td style={{ padding: "6px 8px" }}>{week.total}</td>
            <td style={{ padding: "6px 8px" }}>
              {week.relevancePassRate === null ? "—" : `${week.relevancePassRate}%`}
            </td>
            <td style={{ padding: "6px 8px" }}>
              {week.groundednessPassRate === null ? "—" : `${week.groundednessPassRate}%`}
            </td>
            <td style={{ padding: "6px 8px" }}>
              {week.contextPassRate === null ? "—" : `${week.contextPassRate}%`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
      흐리게 표시된 주는 표본이 30건 미만이라 수치가 흔들립니다.
    </p>
  </div>
)}
```

- [ ] **Step 4: 소급 평가 UI 추가**

`AI 답변 품질` 제목 줄 바로 아래에 추가한다. 실행 전에 **대상 건수와 예상 비용을
반드시 먼저 보여준다.**

파일 상단 import에 추가:

```tsx
import { estimateQualityBackfill, runQualityBackfill } from "../../../lib/api/admin-operations";
```

컴포넌트 상태에 추가:

```tsx
const [backfillInfo, setBackfillInfo] = useState<string | null>(null);
const [isBackfilling, setIsBackfilling] = useState(false);
```

렌더:

```tsx
<div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 16px" }}>
  <button
    type="button"
    className="btn-secondary"
    disabled={!chatbotId || isBackfilling}
    onClick={async () => {
      if (!chatbotId) return;
      setIsBackfilling(true);
      try {
        const est = await estimateQualityBackfill(chatbotId, startDate, endDate);
        if (est.targetCount === 0) {
          setBackfillInfo("이 기간에 평가할 대화가 없습니다.");
          return;
        }
        const won = Math.round(est.estimatedCostUsd * 1400).toLocaleString();
        if (!confirm(`${est.targetCount}건을 평가합니다. 예상 비용 약 ${won}원. 진행할까요?`)) {
          return;
        }
        const result = await runQualityBackfill(chatbotId, startDate, endDate);
        setBackfillInfo(
          `평가 완료 — ${result.evaluated}건 채점, ${result.skipped}건 제외, ${result.failed}건 실패`,
        );
        await load();
      } catch (e) {
        setBackfillInfo(getErrorMessage(e));
      } finally {
        setIsBackfilling(false);
      }
    }}
  >
    {isBackfilling ? "평가 중..." : "과거 구간 평가"}
  </button>
  {backfillInfo && <span style={{ fontSize: 12, color: "#64748b" }}>{backfillInfo}</span>}
</div>
```

**주의:** `chatbotId`, `startDate`, `endDate`, `load`, `getErrorMessage` 는 이 페이지에
이미 있는 이름이어야 한다. 다르면 실제 이름으로 바꿔 쓴다. 파일을 먼저 읽고 확인할 것.

- [ ] **Step 5: 타입 검사**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --project tsconfig.json --noEmit`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/admin/quality-report/page.tsx
git commit -m "feat(quality): 품질 리포트에 AI 답변 품질 섹션·주간 추이·소급 평가"
```

---

## Task 14: 최종 검증 + 배포 태그

**Files:**
- Modify: `apps/api/app/api/health.py:23`

- [ ] **Step 1: 전체 테스트**

Run: `cd apps/api && python -m pytest tests/ -q`
Expected: 전부 PASS

- [ ] **Step 2: 린트 (변경 파일만)**

Run:
```bash
cd apps/api && python -m ruff check app/services/quality/ app/repositories/quality/ app/models/answer_evaluations.py tests/test_quality_evaluation.py
```
Expected: `All checks passed!`

- [ ] **Step 3: 타입 검사**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --project tsconfig.json --noEmit`
Expected: 출력 없음

- [ ] **Step 4: 앱 기동 확인**

Run: `cd apps/api && PYTHONIOENCODING=utf-8 python -c "from app.main import app; print('import ok')"`
Expected: `import ok`

- [ ] **Step 5: BUILD_TAG 갱신**

`apps/api/app/api/health.py:23`

```python
BUILD_TAG = "2026-08-09-answer-quality-evaluation"
```

- [ ] **Step 6: 커밋**

```bash
git add apps/api/app/api/health.py
git commit -m "chore(api): BUILD_TAG 갱신 — answer-quality-evaluation"
```

---

## 배포 시 주의

- **마이그레이션이 있다.** 배포 진입점(`scripts/start.sh`)이 `alembic upgrade head`를
  책임진다. 앱 시작 시 자동 마이그레이션이 없으므로 적용 여부를 로그의
  `[SCHEMA] up-to-date`로 확인한다.
- **api + web + worker 모두 재배포**해야 한다. 크론은 워커에 있다.
- 배포 확인: `curl -s https://api.deepsecu.co.kr/api/health` 의 `build` 값,
  web은 로그인 페이지 HTML의 `buildId` 변경 여부.
- 첫 평가는 배포 다음 날 새벽 3시 10분에 돈다. 즉시 확인하려면 품질 리포트에서
  소급 평가로 어제 구간을 돌린다.

## 이번 범위에서 제외 (스펙과 동일)

- 검토 필요 건의 "확인함" 처리 워크플로
- PDF / Excel 내보내기
- 기관 간 비교 화면
- 만족도 조사(5점 척도)
- 공공기관 특화 지표(24시간 처리, 폐루프 등)
- 전월 대비 증감(▲▼) 표시 — 직전 기간 재조회가 필요하다. 2단계에서 추가
- 지표 카드의 ⓘ 툴팁(정의·기준선 설명) — 문구만 넣으면 되므로 2단계

주간 추이는 **차트가 아니라 표**로 낸다. 값이 정확히 보이고 표본 부족 구간을
흐리게 처리하기 쉽다. 차트는 필요해지면 나중에 교체한다.

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
- context      이전 턴 맥락을 올바로 이어받았는가 (이전 턴이 없으면 score를 null)
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

    # 두 핵심 지표가 모두 없으면 채점으로 볼 수 없다(거부 응답·빈 JSON).
    # None을 돌려줘야 호출부가 재시도하고, 끝내 실패하면 method='failed'로 남는다.
    # 그러지 않으면 {"error": "..."} 같은 거부 응답도 method='llm'·전체 비용·
    # needs_review=False로 저장돼 표본이 조용히 줄면서 llmCount만 늘어난다.
    if result.relevance_score is None and result.groundedness_score is None:
        return None

    return result

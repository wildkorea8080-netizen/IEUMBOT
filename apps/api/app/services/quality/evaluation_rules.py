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
        # 근거 없이 답했다 — 환각 위험이 가장 큰 경우다. 근거성은 여기서 0으로
        # 확정하지만, decided_fully는 세우지 않는다. LLM을 계속 불러 적합성은
        # 채점해야 한다 — 그러지 않으면 가장 의심스러운 답변이 적합성 충족률
        # 분모에서 통째로 빠져 지표가 실제보다 좋게 나온다.
        verdict.groundedness_score = 0
        verdict.needs_review = True
        verdict.reasons["groundedness"] = "인용 근거 없음"

    return verdict

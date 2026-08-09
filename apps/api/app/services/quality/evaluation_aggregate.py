"""충족률 집계. 순수 함수.

표시값은 평균이 아니라 '기준선 이상을 받은 비율'이다. 평균은 꼬리를 숨긴다 —
90%가 100점이고 10%가 42점이면 평균 94.2로 훌륭해 보이지만 열 건 중 하나가 불량이다.
평균은 보조 지표로 함께 낸다.
"""

from dataclasses import dataclass
from datetime import date, timedelta, timezone
from typing import Any

# 한국시간(KST, UTC+9). 월요일 경계를 UTC로 자르면 한국 월요일 오전(00~09시)이
# UTC로는 아직 일요일이라 전주로 밀린다.
_KST = timezone(timedelta(hours=9))

# 고정값. 기관별 설정으로 두면 임계값을 낮춰 점수를 올릴 수 있어 비교가 무너진다.
PASS_THRESHOLD = 70

# 실측 이용량이 챗봇당 하루 6건 수준이다. 일별로 보면 1건 틀릴 때마다 수치가 크게
# 흔들려 품질 변화가 아니라 표본 노이즈를 보게 된다. 주 단위로 묶고, 이보다 적은
# 주는 화면에서 흐리게 처리한다.
MIN_RELIABLE_SAMPLE = 30


@dataclass
class MetricSummary:
    sample_size: int = 0
    pass_rate: float | None = None  # 표본 0이면 None ("데이터 없음")
    average: float | None = None


@dataclass
class EvaluationSummary:
    total: int = 0
    relevance: MetricSummary = None  # type: ignore[assignment]
    groundedness: MetricSummary = None  # type: ignore[assignment]
    context: MetricSummary = None  # type: ignore[assignment]
    followup: MetricSummary = None  # type: ignore[assignment]
    topic_drift_rate: float | None = None
    needs_review_count: int = 0
    llm_count: int = 0
    rule_count: int = 0
    failed_count: int = 0


@dataclass
class WeeklyBucket:
    bucket_start: str  # 그 주 월요일 (YYYY-MM-DD)
    total: int
    reliable: bool  # 표본이 충분한가 — 부족하면 화면에서 흐리게 표시
    relevance: MetricSummary
    groundedness: MetricSummary
    context: MetricSummary


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


def _week_start(value: Any) -> str:
    """그 주 월요일(한국시간 기준). UTC로 자르면 한국 월요일 오전이 전주로 밀린다."""
    if hasattr(value, "astimezone"):
        value = value.astimezone(_KST)
    d: date = value.date() if hasattr(value, "date") else value
    return (d - timedelta(days=d.weekday())).isoformat()


def summarize_by_week(rows: list[Any]) -> list[WeeklyBucket]:
    # message_created_at(답변 발생 시각) 기준으로 묶는다. evaluated_at(채점 시각)으로
    # 묶으면 야간 배치가 전날 답변을 오늘 날짜 버킷에 넣어 주간 경계가 계속 밀린다.
    grouped: dict[str, list[Any]] = {}
    for row in rows:
        grouped.setdefault(_week_start(row.message_created_at), []).append(row)

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

"""AI 답변 품질 자동 평가.

원자료(chat_messages)는 이미 다 쌓이고 있어 평가 레이어만 얹는다.
LLM 호출은 모킹하고, 순수 함수의 판정·집계 로직을 고정한다.
"""

from app.schemas.answer_settings import AnswerSettings
from app.services.quality.evaluation_rules import apply_rules
from app.services.quality.evaluation_selector import SkipReason, should_evaluate


def test_quality_evaluation_is_disabled_by_default() -> None:
    """기본 꺼짐 — 켜지 않은 기관에는 비용이 발생하지 않아야 한다."""
    assert AnswerSettings().answer_policy.quality_evaluation_enabled is False


def test_quality_evaluation_can_be_enabled() -> None:
    settings = AnswerSettings()
    settings.answer_policy.quality_evaluation_enabled = True
    assert settings.answer_policy.quality_evaluation_enabled is True


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


# ── Task 5: 채점 프롬프트 조립 + 응답 파싱 ──────────────────────────────────

from app.services.quality.evaluation_prompt import (  # noqa: E402
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


# ── Task 6: 충족률 집계 + 주간 버킷 ──────────────────────────────────────────

from app.services.quality.evaluation_aggregate import PASS_THRESHOLD, summarize  # noqa: E402


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


# ── _evaluate_one: 규칙·LLM 병합 ────────────────────────────────────────────
# 오케스트레이션의 핵심 — 규칙이 먼저 확정하고, 모자란 부분만 LLM에 묻고,
# 두 판정을 한 행으로 합친다. 여기가 틀리면 경영평가에 들어가는 수치가 틀린다.

import uuid  # noqa: E402
from decimal import Decimal  # noqa: E402

from app.services.quality import evaluation_service  # noqa: E402


class _FakeDB:
    """_evaluate_one은 insert_evaluation(db, row=row) → db.add(row)만 호출한다."""

    def __init__(self) -> None:
        self.added: list = []

    def add(self, row) -> None:
        self.added.append(row)


def _make_eval_message(**kw):
    class _EvalMessage:
        pass

    msg = _EvalMessage()
    msg.id = kw.get("id", uuid.uuid4())
    msg.chatbot_id = kw.get("chatbot_id", uuid.uuid4())
    msg.session_id = kw.get("session_id", uuid.uuid4())
    msg.created_at = kw.get("created_at", datetime(2026, 8, 5, 10, tzinfo=UTC))
    msg.content = kw.get("content", "답변 내용입니다.")
    msg.normalized_query = kw.get("normalized_query", "질문 내용입니다.")
    msg.selected_sources = kw.get("selected_sources", [])
    msg.final_decision = kw.get("final_decision", {"outcome": "answered"})
    msg.classification_result = kw.get("classification_result", {})
    msg.metadata_json = kw.get("metadata_json", {})
    return msg


def _patch_previous_turn(monkeypatch) -> None:
    monkeypatch.setattr(evaluation_service, "_previous_turn", lambda db, *, message: None)


_LLM_MERGE_RESPONSE = (
    '{"relevance": {"reason": "질문에 답함", "score": 92},'
    '"groundedness": {"reason": "근거 일부만 뒷받침", "score": 40},'
    '"context": {"reason": "첫 턴", "score": null},'
    '"topicDrift": {"reason": "업무 범위 내", "drift": false},'
    '"followup": {"reason": "맥락에 맞음", "score": 80}}'
)


def _patch_call_evaluator(
    monkeypatch,
    response_json: str,
    *,
    input_tokens=2500,
    output_tokens=300,
    model="gpt-5-quality-eval",
):
    calls: list = []

    def fake_call_evaluator(db, *, system, user):
        calls.append((system, user))
        return response_json, input_tokens, output_tokens, model

    monkeypatch.setattr(evaluation_service, "_call_evaluator", fake_call_evaluator)
    return calls


def test_no_citation_skips_llm_call(monkeypatch) -> None:
    """근거가 0개면 규칙만으로 확정된다. LLM을 부르면 비용만 나가고 판정은 그대로다."""
    calls = _patch_call_evaluator(monkeypatch, _LLM_MERGE_RESPONSE)
    _patch_previous_turn(monkeypatch)

    db = _FakeDB()
    message = _make_eval_message(selected_sources=[])
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    assert len(calls) == 0
    assert len(db.added) == 1
    row = db.added[0]
    assert row.method == "rule"
    assert row.groundedness_score == 0
    assert row.needs_review is True


def test_llm_path_merges_scores_and_computes_cost(monkeypatch) -> None:
    """근거가 있으면 LLM 채점을 병합해 저장한다. 토큰 단가 계산이 틀리면 비용 리포트가 틀린다."""
    _patch_call_evaluator(monkeypatch, _LLM_MERGE_RESPONSE, input_tokens=2500, output_tokens=300)
    _patch_previous_turn(monkeypatch)

    db = _FakeDB()
    message = _make_eval_message(
        selected_sources=[{"id": "s1", "textPreview": "근거 내용"}],
        metadata_json={"followUpQuestions": ["다음 질문은?"]},
    )
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    assert len(db.added) == 1
    row = db.added[0]
    assert row.method == "llm"
    assert row.relevance_score == 92
    assert row.groundedness_score == 40
    assert row.context_score is None
    assert row.followup_score == 80
    assert row.evaluator_model == "gpt-5-quality-eval"
    assert row.cost_usd == Decimal("0.007400")


def test_needs_review_when_groundedness_below_pass_threshold(monkeypatch) -> None:
    """근거 부합도가 기준선(70) 밑이면 검토 대상이다. 조용히 통과시키면 품질 저하를 놓친다."""
    _patch_call_evaluator(monkeypatch, _LLM_MERGE_RESPONSE)
    _patch_previous_turn(monkeypatch)

    db = _FakeDB()
    message = _make_eval_message(
        selected_sources=[{"id": "s1", "textPreview": "근거 내용"}],
        metadata_json={"followUpQuestions": ["다음 질문은?"]},
    )
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    row = db.added[0]
    assert row.groundedness_score == 40  # PASS_THRESHOLD(70) 미만
    assert row.needs_review is True


def test_needs_review_false_when_all_scores_pass(monkeypatch) -> None:
    """모든 점수가 기준선 이상이고 이탈도 없으면 검토 대기열에 쌓이지 않아야 한다."""
    response_json = (
        '{"relevance": {"reason": "적합", "score": 90},'
        '"groundedness": {"reason": "근거와 일치", "score": 90},'
        '"context": {"reason": "첫 턴", "score": null},'
        '"topicDrift": {"reason": "업무 범위 내", "drift": false},'
        '"followup": {"reason": "맥락에 맞음", "score": 90}}'
    )
    _patch_call_evaluator(monkeypatch, response_json)
    _patch_previous_turn(monkeypatch)

    db = _FakeDB()
    message = _make_eval_message(
        selected_sources=[{"id": "s1", "textPreview": "근거 내용"}],
        metadata_json={"followUpQuestions": ["다음 질문은?"]},
    )
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    row = db.added[0]
    assert row.needs_review is False


def test_faq_rule_groundedness_wins_over_llm_guess(monkeypatch) -> None:
    """FAQ 등록 답변은 그 자체가 근거다. LLM이 40점으로 깎아도 규칙의 100점을 지켜야 한다."""
    response_json = (
        '{"relevance": {"reason": "적합", "score": 90},'
        '"groundedness": {"reason": "근거 불명확", "score": 40},'
        '"context": {"reason": "첫 턴", "score": null},'
        '"topicDrift": {"reason": "업무 범위 내", "drift": false},'
        '"followup": {"reason": "해당 없음", "score": null}}'
    )
    _patch_call_evaluator(monkeypatch, response_json)
    _patch_previous_turn(monkeypatch)

    db = _FakeDB()
    message = _make_eval_message(
        selected_sources=[],
        final_decision={"outcome": "answered", "reason": "faq_match"},
    )
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    row = db.added[0]
    assert row.method == "llm"
    assert row.groundedness_score == 100

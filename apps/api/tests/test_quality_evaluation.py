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
    """근거 없이 답했으면 환각 위험 — 근거성은 규칙으로 0점 확정.

    다만 decided_fully는 세우지 않는다. LLM 호출까지 건너뛰면 적합성이 NULL로
    남아, 가장 의심스러운 답변(근거 없음)이 적합성 충족률 분모에서 빠진다.
    적합성은 여전히 LLM이 채점해야 한다.
    """
    verdict = apply_rules(selected_sources=[], is_faq=False, followups=[], is_out_of_scope=False)
    assert verdict.groundedness_score == 0
    assert verdict.needs_review is True
    assert verdict.decided_fully is False


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


def test_parse_empty_json_is_not_a_valid_evaluation() -> None:
    """빈 JSON({})은 채점이 아니다. None을 돌려줘야 호출부가 재시도한다."""
    assert parse_evaluation_response("{}") is None


def test_parse_refusal_response_is_not_a_valid_evaluation() -> None:
    """거부 응답이 all-NULL 점수로 파싱되면 method='llm'·전체 비용으로 조용히 저장된다.

    두 핵심 지표(relevance, groundedness)가 모두 없으면 채점으로 보지 않는다.
    """
    raw = '{"error": "I cannot evaluate this content"}'
    assert parse_evaluation_response(raw) is None


def test_parse_keeps_result_when_only_one_core_metric_present() -> None:
    """relevance만 있어도(근거 0건 규칙 케이스 등) 유효한 채점으로 본다."""
    raw = '{"relevance": {"reason": "질문에 답함", "score": 80}}'
    parsed = parse_evaluation_response(raw)
    assert parsed is not None
    assert parsed.relevance_score == 80


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


def test_topic_drift_denominator_excludes_failed_rows() -> None:
    """실패 건은 판정된 적이 없다. 분모에 넣으면 이탈률이 실제보다 낮게 나온다.

    1건 이탈 / 8건 판정 + 2건 실패 → 진짜 이탈률은 12.5%다. 실패 2건을 분모에
    넣으면(1/10) 10.0%로 낮게 나와 실제보다 품질이 좋아 보인다.
    """
    rows = (
        [_Eval(topic_drift=True, method="llm")]
        + [_Eval(method="llm") for _ in range(7)]
        + [_Eval(method="failed") for _ in range(2)]
    )
    summary = summarize(rows)
    assert summary.topic_drift_rate == 12.5


def test_topic_drift_rate_is_none_when_nothing_was_assessed() -> None:
    """전부 실패 건이면 이탈률은 0%가 아니라 '데이터 없음'이어야 한다."""
    rows = [_Eval(method="failed"), _Eval(method="failed")]
    summary = summarize(rows)
    assert summary.topic_drift_rate is None


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
    """message_created_at(답변 발생 시각) 기준으로 버킷을 나눈다.

    evaluated_at(채점 시각)으로 나누면 소급 평가·야간 배치가 전부 같은 날짜에
    몰려 주간 경계가 실제 대화 시점과 어긋난다.
    """

    def __init__(self, message_created_at, **kw):
        super().__init__(**kw)
        self.message_created_at = message_created_at


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


def test_weekly_bucket_uses_kst_monday_boundary() -> None:
    """UTC로 자르면 한국 월요일 새벽이 전주로 밀린다.

    2026-08-10(월) 01:00+09:00(KST)는 UTC로는 2026-08-09(일) 16:00이라
    UTC 기준이면 08-03주로 잘못 묶인다. KST로 변환한 뒤 잘라야 08-10주가 맞다.
    """
    from datetime import timedelta, timezone  # noqa: PLC0415

    kst = timezone(timedelta(hours=9))
    rows = [_TimedEval(datetime(2026, 8, 10, 1, tzinfo=kst), relevance_score=90)]
    buckets = summarize_by_week(rows)
    assert buckets[0].bucket_start == "2026-08-10"


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


def test_no_citation_still_calls_llm_for_relevance(monkeypatch) -> None:
    """근거가 0개여도 적합성은 LLM이 채점해야 한다 (FIX 7).

    이전에는 근거 0건이면 규칙만으로 완전히 확정하고 LLM을 아예 부르지 않아
    적합성(relevance)이 NULL로 남았다. 가장 의심스러운 답변(근거 없이 답함)이
    적합성 충족률 분모에서 통째로 빠지는 결과였다. 근거성 0점은 규칙이
    지키고, 적합성만 LLM에 새로 묻는다.
    """
    calls = _patch_call_evaluator(monkeypatch, _LLM_MERGE_RESPONSE)
    _patch_previous_turn(monkeypatch)

    db = _FakeDB()
    message = _make_eval_message(selected_sources=[])
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    assert len(calls) == 1
    assert len(db.added) == 1
    row = db.added[0]
    assert row.method == "llm"
    # 규칙의 0점을 지킨다 — LLM 응답(_LLM_MERGE_RESPONSE)의 groundedness=40을 무시.
    assert row.groundedness_score == 0
    assert row.relevance_score == 92
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


# ── FIX 2: 첫 턴에는 맥락 유지 점수를 저장하지 않는다 ─────────────────────────
# 프롬프트는 모델에게 null을 "요청"할 뿐 강제하지 못한다. 모델이 점수를 줘도
# 직전 대화가 없으면 호출부가 버려야 한다 — 그렇지 않으면 성립하지 않는 지표에
# 값이 채워져 충족률이 오염된다.

_LLM_RESPONSE_WITH_CONTEXT_SCORE = (
    '{"relevance": {"reason": "질문에 답함", "score": 92},'
    '"groundedness": {"reason": "근거와 일치", "score": 88},'
    '"context": {"reason": "직전 대화를 잘 이어받음", "score": 88},'
    '"topicDrift": {"reason": "업무 범위 내", "drift": false},'
    '"followup": {"reason": "맥락에 맞음", "score": 80}}'
)


def test_context_score_discarded_when_no_previous_turn(monkeypatch) -> None:
    """첫 턴인데 모델이 88점을 줘도 저장하면 안 된다 — 성립하지 않는 지표다."""
    _patch_call_evaluator(monkeypatch, _LLM_RESPONSE_WITH_CONTEXT_SCORE)
    monkeypatch.setattr(evaluation_service, "_previous_turn", lambda db, *, message: None)

    db = _FakeDB()
    message = _make_eval_message(selected_sources=[{"id": "s1", "textPreview": "근거 내용"}])
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    row = db.added[0]
    assert row.context_score is None


def test_context_score_kept_when_previous_turn_exists(monkeypatch) -> None:
    """직전 대화가 있으면 모델 점수를 그대로 저장한다."""
    _patch_call_evaluator(monkeypatch, _LLM_RESPONSE_WITH_CONTEXT_SCORE)
    monkeypatch.setattr(
        evaluation_service, "_previous_turn", lambda db, *, message: "직전 질문 내용"
    )

    db = _FakeDB()
    message = _make_eval_message(selected_sources=[{"id": "s1", "textPreview": "근거 내용"}])
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    row = db.added[0]
    assert row.context_score == 88


# ── FIX 3: commit 실패가 배치 전체를 죽이면 안 된다 ───────────────────────────
# 야간 배치는 세션 하나를 조직 전체가 공유한다. 한 건의 UNIQUE 위반(소급 평가와
# 겹침)이나 원인불명 실패가 나머지 모든 기관의 남은 건 처리를 막으면 안 된다.

from sqlalchemy.exc import IntegrityError  # noqa: E402


class _FakeRangeDB:
    """evaluate_chatbot_range의 commit/rollback 흐름만 검증하는 스텁.

    add()는 evaluate_service._evaluate_one/_record_failed가 모킹되므로 쓰이지 않는다.
    """

    def __init__(self, fail_commits_on: set[int] | None = None) -> None:
        self.commit_calls = 0
        self.rollback_calls = 0
        self._fail_commits_on = fail_commits_on or set()

    def add(self, row) -> None:  # pragma: no cover - 모킹 경로에서는 호출되지 않는다
        pass

    def commit(self) -> None:
        self.commit_calls += 1
        if self.commit_calls in self._fail_commits_on:
            raise IntegrityError("INSERT ...", {}, Exception("uq_answer_evaluations_message"))

    def rollback(self) -> None:
        self.rollback_calls += 1


def _patch_range_dependencies(monkeypatch, messages: list) -> None:
    monkeypatch.setattr(evaluation_service, "count_evaluated_since", lambda *a, **kw: 0)
    monkeypatch.setattr(
        evaluation_service, "list_unevaluated_messages", lambda *a, **kw: messages
    )
    monkeypatch.setattr(evaluation_service, "should_evaluate", lambda message: None)


def test_duplicate_message_does_not_abort_remaining_batch(monkeypatch) -> None:
    """두 번째 건 커밋에서 UNIQUE 위반이 나도 세 번째 건은 계속 처리돼야 한다."""
    messages = [_make_eval_message() for _ in range(3)]
    _patch_range_dependencies(monkeypatch, messages)
    monkeypatch.setattr(
        evaluation_service, "_evaluate_one", lambda db, *, organization_id, message: None
    )

    db = _FakeRangeDB(fail_commits_on={2})
    result = evaluation_service.evaluate_chatbot_range(
        db,
        organization_id=str(uuid.uuid4()),
        chatbot_id=str(uuid.uuid4()),
        start_at=datetime(2026, 8, 1, tzinfo=UTC),
        end_at=datetime(2026, 8, 2, tzinfo=UTC),
    )

    # 1번째: 성공, 2번째: 커밋 시 UNIQUE 위반 → 중복으로 건너뜀, 3번째: 성공
    assert result == {"evaluated": 2, "skipped": 1, "failed": 0, "limited": 0}
    assert db.rollback_calls == 1


def test_unexpected_failure_on_one_message_does_not_abort_remaining_batch(monkeypatch) -> None:
    """원인불명 예외가 나도 나머지 건은 계속 평가되고, 실패는 기록만 된다."""
    messages = [_make_eval_message() for _ in range(3)]
    _patch_range_dependencies(monkeypatch, messages)

    seen: list = []

    def fake_evaluate_one(db, *, organization_id, message):
        seen.append(message.id)
        if len(seen) == 2:
            raise RuntimeError("boom")

    recorded_failed: list = []
    monkeypatch.setattr(evaluation_service, "_evaluate_one", fake_evaluate_one)
    monkeypatch.setattr(
        evaluation_service,
        "_record_failed",
        lambda db, *, organization_id, message, **_kw: recorded_failed.append(message.id),
    )

    db = _FakeRangeDB()
    result = evaluation_service.evaluate_chatbot_range(
        db,
        organization_id=str(uuid.uuid4()),
        chatbot_id=str(uuid.uuid4()),
        start_at=datetime(2026, 8, 1, tzinfo=UTC),
        end_at=datetime(2026, 8, 2, tzinfo=UTC),
    )

    assert result == {"evaluated": 2, "skipped": 0, "failed": 1, "limited": 0}
    assert len(recorded_failed) == 1
    # 처음 두 메시지에서 멈추지 않고 세 번째까지 봤다.
    assert len(seen) == 3


# ── FIX 4: 재시도 토큰을 누락 없이 합산한다 ──────────────────────────────────
# 건당 최대 3회까지 과금될 수 있는데 마지막 시도 값만 남기면 지출이 최대 3배
# 과소 표시된다. 파싱에 실패한 시도도 실제로는 과금된 호출이다.

import pytest  # noqa: E402


def test_llm_path_accumulates_tokens_across_failed_retries(monkeypatch) -> None:
    """1차는 파싱 실패(그래도 과금), 2차는 성공. 두 시도 토큰을 합산해야 한다."""
    _patch_previous_turn(monkeypatch)
    responses = [
        ("설명만 있고 JSON 없음", 1000, 50, "gpt-5-quality-eval"),
        (_LLM_MERGE_RESPONSE, 2500, 300, "gpt-5-quality-eval"),
    ]
    calls: list = []

    def fake_call_evaluator(db, *, system, user):
        calls.append((system, user))
        return responses[len(calls) - 1]

    monkeypatch.setattr(evaluation_service, "_call_evaluator", fake_call_evaluator)

    db = _FakeDB()
    message = _make_eval_message(selected_sources=[{"id": "s1", "textPreview": "근거 내용"}])
    evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    row = db.added[0]
    assert len(calls) == 2
    assert row.input_tokens == 1000 + 2500
    assert row.output_tokens == 50 + 300


def test_all_retries_failing_still_carries_accumulated_tokens(monkeypatch) -> None:
    """3회 모두 파싱 실패해도 각 시도가 과금한 토큰은 예외에 실려야 한다.

    이게 없으면 evaluate_chatbot_range가 실패 건을 지출 0으로 기록해
    '이번 달 지출'이 실제보다 적게 보인다.
    """
    _patch_previous_turn(monkeypatch)

    def fake_call_evaluator(db, *, system, user):
        return "JSON이 아닌 응답", 500, 20, "gpt-5-quality-eval"

    monkeypatch.setattr(evaluation_service, "_call_evaluator", fake_call_evaluator)

    db = _FakeDB()
    message = _make_eval_message(selected_sources=[{"id": "s1", "textPreview": "근거 내용"}])

    with pytest.raises(evaluation_service._EvaluationCallFailed) as excinfo:
        evaluation_service._evaluate_one(db, organization_id=str(uuid.uuid4()), message=message)

    assert excinfo.value.input_tokens == 500 * 3
    assert excinfo.value.output_tokens == 20 * 3


def test_record_failed_persists_accumulated_cost() -> None:
    """실패 건도 토큰이 있으면 cost_usd를 남겨야 지출 집계가 실제와 맞는다."""
    db = _FakeDB()
    message = _make_eval_message()
    evaluation_service._record_failed(
        db,
        organization_id=str(uuid.uuid4()),
        message=message,
        input_tokens=1500,
        output_tokens=90,
    )

    row = db.added[0]
    assert row.method == "failed"
    assert row.input_tokens == 1500
    assert row.output_tokens == 90
    assert row.cost_usd == evaluation_service._cost_usd(1500, 90)


def test_batch_level_failure_records_tokens_from_exception(monkeypatch) -> None:
    """evaluate_chatbot_range가 실패 예외에 실린 토큰을 _record_failed로 넘겨야 한다."""
    messages = [_make_eval_message()]
    _patch_range_dependencies(monkeypatch, messages)

    def fake_evaluate_one(db, *, organization_id, message):
        raise evaluation_service._EvaluationCallFailed(
            "EVALUATION_PARSE_FAILED", input_tokens=777, output_tokens=33
        )

    recorded: list = []
    monkeypatch.setattr(evaluation_service, "_evaluate_one", fake_evaluate_one)
    monkeypatch.setattr(
        evaluation_service,
        "_record_failed",
        lambda db, *, organization_id, message, input_tokens=0, output_tokens=0: recorded.append(
            (input_tokens, output_tokens)
        ),
    )

    db = _FakeRangeDB()
    result = evaluation_service.evaluate_chatbot_range(
        db,
        organization_id=str(uuid.uuid4()),
        chatbot_id=str(uuid.uuid4()),
        start_at=datetime(2026, 8, 1, tzinfo=UTC),
        end_at=datetime(2026, 8, 2, tzinfo=UTC),
    )

    assert result["failed"] == 1
    assert recorded == [(777, 33)]


# ── FIX D(리뷰): USE_ARQ_WORKER=false여도 야간 평가가 돌아야 한다 ─────────────
# Arq를 켜지 않은 기본 배포에서 관리자가 품질 평가 토글을 켜면, 이전에는
# workers/main.py의 Arq 크론 안에만 활성 챗봇 순회 루프가 있어서 아무 것도
# 채점되지 않은 채 방치됐다("다음 날 새벽부터 채점이 시작됩니다"라고 안내하고
# 조용히 방치). run_nightly_evaluation()이 그 루프의 유일한 사본이어야 하고,
# Arq 크론과 APScheduler 폴백이 이 함수 하나를 공유해야 한다.


class _FakeSessionWithClose:
    """close()만 관찰하면 되는 최소 세션 스텁 — SessionLocal() 자리를 대신한다."""

    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


def test_run_nightly_evaluation_sums_totals_across_enabled_chatbots(monkeypatch) -> None:
    chatbots = [("org-1", "bot-1"), ("org-2", "bot-2")]
    monkeypatch.setattr(evaluation_service, "enabled_chatbot_ids", lambda db: chatbots)

    calls: list[tuple[str, str]] = []

    def fake_range(db, *, organization_id, chatbot_id, start_at, end_at):
        calls.append((organization_id, chatbot_id))
        return {"evaluated": 1, "skipped": 2, "failed": 0}

    monkeypatch.setattr(evaluation_service, "evaluate_chatbot_range", fake_range)

    totals = evaluation_service.run_nightly_evaluation(_FakeRangeDB())

    assert calls == chatbots
    assert totals == {"evaluated": 2, "skipped": 4, "failed": 0}


def test_run_nightly_evaluation_survives_one_chatbot_failing(monkeypatch) -> None:
    """세션 하나를 조직 전체가 공유한다 — 한 기관이 터져도 나머지는 그날 밤 계속 평가돼야 한다."""
    chatbots = [("org-1", "bot-1"), ("org-2", "bot-2"), ("org-3", "bot-3")]
    monkeypatch.setattr(evaluation_service, "enabled_chatbot_ids", lambda db: chatbots)

    seen: list[str] = []

    def fake_range(db, *, organization_id, chatbot_id, start_at, end_at):
        seen.append(chatbot_id)
        if chatbot_id == "bot-2":
            raise RuntimeError("boom")
        return {"evaluated": 1, "skipped": 0, "failed": 0}

    monkeypatch.setattr(evaluation_service, "evaluate_chatbot_range", fake_range)

    db = _FakeRangeDB()
    totals = evaluation_service.run_nightly_evaluation(db)

    assert seen == ["bot-1", "bot-2", "bot-3"]
    assert totals == {"evaluated": 2, "skipped": 0, "failed": 0}
    assert db.rollback_calls == 1


def test_run_nightly_evaluation_sync_opens_and_closes_own_session(monkeypatch) -> None:
    """APScheduler 폴백은 인자를 못 받는 no-arg 잡이다 — 래퍼가 세션을 직접 열고 닫아야 한다."""
    monkeypatch.setattr(evaluation_service, "enabled_chatbot_ids", lambda db: [])

    session = _FakeSessionWithClose()
    import app.db as app_db  # noqa: PLC0415

    monkeypatch.setattr(app_db, "SessionLocal", lambda: session)

    totals = evaluation_service.run_nightly_evaluation_sync()

    assert totals == {"evaluated": 0, "skipped": 0, "failed": 0}
    assert session.closed is True


def test_apscheduler_fallback_registers_quality_evaluation() -> None:
    """USE_ARQ_WORKER=false 배포에서 품질 평가가 아예 안 도는 회귀를 막는다."""
    import ast
    from pathlib import Path

    main_path = Path(__file__).resolve().parents[1] / "app" / "main.py"
    source = main_path.read_text(encoding="utf-8")
    assert "run_nightly_evaluation_sync" in source

    tree = ast.parse(source, filename=str(main_path))
    add_job_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "add_job"
    ]
    assert len(add_job_calls) == 2, "지식 동기화 + 품질 평가, 두 건이 스케줄러에 등록돼야 한다"

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

from sqlalchemy.exc import IntegrityError  # top-level import
from sqlalchemy.orm import Session

from app.models import AnswerEvaluation, ChatbotSetting
from app.repositories.quality.answer_evaluation_repository import (
    count_evaluated_since,
    insert_evaluation,
    list_unevaluated_messages,
)
from app.services.quality.evaluation_aggregate import PASS_THRESHOLD
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
# 건당 최대 _MAX_CALL_RETRY 회 호출되므로 실제 호출 상한은 이 값의 3배다.
# 상한을 '행 수'로 두는 이유는 과금이 아니라 폭주 방지가 목적이기 때문이다.
# (동시 실행 간 트랜잭션 잠금까지는 이 범위에서 다루지 않는다 — count_evaluated_since는
# 실행 시점 스냅샷이라 여러 배치가 겹치면 상한을 살짝 넘을 수 있다.)
_MAX_CALL_RETRY = 3
_CALL_TIMEOUT_SEC = 30.0
# 상위 모델 단가(1M 토큰당 USD). 모델 가격이 바뀌면 여기만 고친다.
_USD_PER_1M_INPUT = Decimal("2.00")
_USD_PER_1M_OUTPUT = Decimal("8.00")


class _EvaluationCallFailed(RuntimeError):
    """모든 재시도가 실패했을 때 발생.

    파싱 실패로 끝난 시도도 실제로는 과금된 호출이다(JSON이 깨졌을 뿐 토큰은
    나갔다). 그 누적 토큰을 들고 다녀 _record_failed가 실 지출을 남기게 한다 —
    그러지 않으면 실패 건은 지출이 0으로 보여 '이번 달 지출'이 실제보다 적게 나온다.
    """

    def __init__(self, message: str, *, input_tokens: int = 0, output_tokens: int = 0) -> None:
        super().__init__(message)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


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
    """직전 사용자 질문 1건. 맥락 유지 채점에 쓴다.

    가장 최근 user 메시지는 이 답변이 답한 질문이다. 그 이전 것이 '직전 대화'.
    """
    from sqlalchemy import select  # noqa: PLC0415

    from app.models import ChatMessage  # noqa: PLC0415

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
    return rows[1].content if len(rows) > 1 else None


def _call_evaluator(db: Session, *, system: str, user: str) -> tuple[str, int, int, str]:
    """평가 모델 호출. (본문, input_tokens, output_tokens, model) 반환.

    provider가 openai/anthropic 어느 쪽이든 동작해야 한다.
    query_rewriter_service와 같은 분기 패턴을 따른다.
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


def _base_row(organization_id: str, message: Any) -> AnswerEvaluation:
    return AnswerEvaluation(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=message.chatbot_id,
        message_id=message.id,
        session_id=message.session_id,
        evaluated_at=datetime.now(UTC),
        # 조회·집계는 이 값을 쓴다(evaluated_at은 채점 시각이라 소급 평가 시 오늘 날짜로 쏠린다).
        message_created_at=message.created_at,
        prompt_version=PROMPT_VERSION,
    )


def _record_failed(
    db: Session,
    *,
    organization_id: str,
    message: Any,
    input_tokens: int = 0,
    output_tokens: int = 0,
) -> None:
    """실패를 조용히 넘기지 않는다. 표본 수가 몰래 줄면 통계가 왜곡된다.

    최대 _MAX_CALL_RETRY회까지 시도했을 수 있으므로 실패해도 과금된 토큰이 있을
    수 있다. 0으로 남기면 지출 화면이 실제보다 적게 보인다.
    """
    row = _base_row(organization_id, message)
    row.method = "failed"
    row.verdict_json = {"error": "evaluation_failed"}
    row.input_tokens = input_tokens
    row.output_tokens = output_tokens
    if input_tokens or output_tokens:
        row.cost_usd = _cost_usd(input_tokens, output_tokens)
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

    previous_turn = _previous_turn(db, message=message)
    user_prompt = build_evaluation_prompt(
        question=message.normalized_query or "",
        answer=message.content or "",
        sources=sources,
        previous_turn=previous_turn,
        followups=followups,
    )

    parsed = None
    last_error: Exception | None = None
    # 재시도 전체의 누적치 — 성공 직전 실패한 시도도 과금된 호출이라 합산해야
    # 실 지출과 맞는다. 마지막 시도 값만 남기면 최대 3배까지 과소 표시된다.
    total_input_tokens = 0
    total_output_tokens = 0
    model: str | None = None
    for _attempt in range(_MAX_CALL_RETRY):
        try:
            text, input_tokens, output_tokens, model = _call_evaluator(
                db, system=system_prompt(), user=user_prompt
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
        total_input_tokens += input_tokens
        total_output_tokens += output_tokens
        parsed = parse_evaluation_response(text)
        if parsed is not None:
            break
        # 형식이 깨진 응답도 재시도 대상이다.
        last_error = RuntimeError("EVALUATION_PARSE_FAILED")

    if parsed is None:
        raise _EvaluationCallFailed(
            str(last_error or "EVALUATION_PARSE_FAILED"),
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
        )

    row.method = "llm"
    row.evaluator_model = model
    row.relevance_score = parsed.relevance_score
    # 직전 대화가 없으면 맥락 유지는 성립하지 않는다. 모델이 점수를 줘도 버린다.
    # 프롬프트가 null을 요청할 뿐 강제하지 못하므로 여기서 게이트를 건다.
    row.context_score = parsed.context_score if previous_turn is not None else None
    if pre.groundedness_score is None:
        row.groundedness_score = parsed.groundedness_score
    if not pre.followup_decided:
        row.followup_score = parsed.followup_score
    row.topic_drift = pre.topic_drift or parsed.topic_drift

    row.needs_review = bool(
        pre.needs_review
        or row.topic_drift
        or (row.relevance_score is not None and row.relevance_score < PASS_THRESHOLD)
        or (row.groundedness_score is not None and row.groundedness_score < PASS_THRESHOLD)
    )

    verdict.update(parsed.reasons)
    row.verdict_json = verdict
    row.input_tokens = total_input_tokens
    row.output_tokens = total_output_tokens
    row.cost_usd = _cost_usd(total_input_tokens, total_output_tokens)
    insert_evaluation(db, row=row)


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
            # 커밋도 try 안에 둔다. UNIQUE 위반은 commit 시점에 터지는데, 밖에 두면
            # 그 예외가 루프를 뚫고 나가 남은 건이 통째로 처리되지 않는다
            # (한 세션을 조직 전체가 공유하는 야간 배치라 영향이 전 기관으로 번진다).
            db.commit()
            evaluated += 1
        except IntegrityError:
            # 이미 평가된 건(소급 평가와 야간 배치가 겹칠 때). 실패가 아니라 중복이다.
            db.rollback()
            skipped += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("[QUALITY_EVAL] failed message=%s: %s", message.id, exc)
            db.rollback()
            # _EvaluationCallFailed면 재시도 중 과금된 토큰이 실려 있다.
            input_tokens = getattr(exc, "input_tokens", 0)
            output_tokens = getattr(exc, "output_tokens", 0)
            try:
                _record_failed(
                    db,
                    organization_id=organization_id,
                    message=message,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                db.commit()
            except Exception:  # noqa: BLE001
                # 실패 기록 자체가 실패해도 다음 건 처리를 막지 않는다.
                db.rollback()
            failed += 1

    logger.info(
        "[QUALITY_EVAL] chatbot=%s evaluated=%d skipped=%d failed=%d",
        chatbot_id,
        evaluated,
        skipped,
        failed,
    )
    return {"evaluated": evaluated, "skipped": skipped, "failed": failed, "limited": 0}


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


def run_nightly_evaluation(db: Session) -> dict[str, int]:
    """전날 답변 채점의 핵심 루프.

    Arq 크론(evaluate_answer_quality)과 USE_ARQ_WORKER=false일 때의 APScheduler
    폴백이 이 함수를 함께 쓴다. 이전에는 이 루프가 워커 태스크 안에만 있어서,
    Arq를 켜지 않은 기본 배포에서는 관리자가 품질 평가를 켜도 아무 것도 돌지
    않는 채로 조용히 방치됐다.

    세션 하나를 활성 챗봇 전체가 공유한다. 한 챗봇에서 터진 예외가 그날 밤
    나머지 전 기관 평가를 막으면 안 되므로 챗봇 단위로 rollback 후 계속한다.
    """
    end_at = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    start_at = end_at - timedelta(days=1)
    totals = {"evaluated": 0, "skipped": 0, "failed": 0}
    for organization_id, chatbot_id in enabled_chatbot_ids(db):
        try:
            result = evaluate_chatbot_range(
                db,
                organization_id=organization_id,
                chatbot_id=chatbot_id,
                start_at=start_at,
                end_at=end_at,
            )
            for key in totals:
                totals[key] += result.get(key, 0)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[QUALITY_EVAL] chatbot skipped org=%s chatbot=%s error=%s",
                organization_id,
                chatbot_id,
                exc,
            )
            db.rollback()
    return totals


def run_nightly_evaluation_sync() -> dict[str, int]:
    """세션을 직접 열고 닫는 no-arg 래퍼.

    USE_ARQ_WORKER=false일 때 app/main.py의 APScheduler 폴백이 이 함수를 그대로
    등록해 쓴다. APScheduler는 코루틴이 아닌 함수를 자체 스레드풀 executor에서
    돌리므로(sync_all_due_web_sources와 동일 패턴) 이벤트 루프를 막지 않는다 —
    여기서 asyncio.to_thread로 다시 감쌀 필요가 없다.
    """
    from app.db import SessionLocal  # noqa: PLC0415

    db = SessionLocal()
    try:
        return run_nightly_evaluation(db)
    finally:
        db.close()

import logging
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.chat.policy_repository import get_chatbot_by_id
from app.repositories.chat.runtime_repository import (
    count_user_messages_in_session,
    create_chat_message,
    create_chat_session,
    create_citations,
    get_chat_session_by_token,
    list_recent_session_messages,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.chat_policy import PreAnswerRequest
from app.schemas.chat_runtime import ChatRuntimeResponse
from app.services.chat.answer_generation_service import generate_grounded_answer
from app.services.chat.citation_service import assemble_citations
from app.services.chat.fallback_response_service import build_fallback_response
from app.services.chat.policy_evaluation_service import evaluate_answer_policy
from app.services.chat.prompt_assembly_service import build_answer_prompt
from app.services.chat.retrieval_precheck_service import normalize_query, retrieve_for_precheck
from app.services.enforcement_service import ensure_runtime_access_for_chatbot
from app.services.escalations.runtime_escalation_service import (
    get_effective_escalation_rules_for_runtime,
    map_escalation_target_for_runtime,
)
from app.services.guardrails.runtime_guardrails_service import get_effective_guardrails_for_runtime
from app.services.limits_service import check_conversation_limit
from app.services.settings.answer_settings_service import get_effective_answer_settings_for_runtime

logger = logging.getLogger(__name__)

SAFE_CHAT_ERROR_MESSAGE = (
    "현재 자동 답변 처리에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주시거나, "
    "질문을 조금 더 구체적으로 남겨주시면 확인 가능한 범위에서 다시 안내해 드리겠습니다."
)

GREETING_RESPONSE = "안녕하세요. 무엇을 도와드릴까요?"
THANKS_RESPONSE = "도움이 되었다니 다행입니다. 추가로 궁금하신 내용이 있으면 말씀해주세요."
GOODBYE_RESPONSE = "이용해주셔서 감사합니다. 좋은 하루 보내세요."
SMALL_TALK_FIRST_RESPONSE = (
    "어떤 사업이나 절차에 대해 궁금하신지 조금 더 알려주시면 더 정확히 안내드릴 수 있습니다."
)
SMALL_TALK_REDIRECT_RESPONSE = (
    "궁금하신 사업명, 신청 단계, 대상 기관 중 하나를 알려주시면 확인 가능한 범위에서 안내드리겠습니다."
)
SOFT_GUIDANCE_RESPONSES = [
    "어떤 사업이나 절차에 대해 궁금하신지 조금 더 알려주시면 더 정확히 안내드릴 수 있습니다.",
    (
        "등록된 자료에서 관련 정보를 충분히 찾지 못했습니다. "
        "질문을 조금 더 구체적으로 입력해주시면 다시 확인해드리겠습니다."
    ),
]
ABUSIVE_KEYWORDS = {
    "critical": ["죽어", "fuck you", "꺼져", "씨발", "개새끼"],
    "high": ["시발", "병신", "bastard"],
    "medium": ["멍청", "idiot", "stupid"],
    "low": ["짜증", "답답", "별로", "이상하네"],
}
DISSATISFACTION_KEYWORDS = [
    "이상해",
    "이상하네",
    "별로야",
    "쓸모없어",
    "보여줘",
    "왜 이래",
    "말이 안",
    "틀렸",
    "다시 말해",
    "다시 설명",
    "불만",
    "답답",
    "not helpful",
    "wrong answer",
    "this is wrong",
]
CONTACT_QUESTION_KEYWORDS = ["연락처", "전화", "전화번호", "문의처", "담당자", "담당부서"]
CONTACT_LINE_KEYWORDS = ["문의처", "연락처", "전화", "전화번호", "담당자", "담당부서", "담당"]
BUSINESS_REPORT_CONTACT_TERMS = ["사업신고", "신고업무", "변경신고", "사업계획 신고", "신고절차", "처리절차"]
PHONE_NUMBER_REGEX = re.compile(r"(?:\d{2,3}[-.)]\d{3,4}[-.)]\d{4}|\d{2,3}\.\d{3,4}\.\d{4})")
OVERSEAS_INTERN_KEYWORDS = ["해외인턴", "해외 인턴", "인턴사원"]
QUALIFICATION_QUESTION_KEYWORDS = [
    "자격",
    "자격요건",
    "지원자격",
    "신청자격",
    "선발자격",
    "요건",
    "대상",
]
INTERN_QUALIFICATION_ANCHORS = ["인턴사원 선발자격 및 인원", "인턴사원", "선발자격"]


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _simple_natural_response(question: str, *, user_turn_count: int) -> tuple[str, str] | None:
    normalized = _normalize_text(question)
    if not normalized:
        return None

    has_business_signal = any(
        keyword in normalized
        for keyword in [
            "사업",
            "지원",
            "교육",
            "일정",
            "자격",
            "조건",
            "신청",
            "방법",
            "서류",
            "문의",
            "연락",
            "센터",
            "기관",
            "?",
        ]
    )
    if has_business_signal:
        return None

    if normalized in {"안녕", "안녕하세요", "반갑습니다", "반가워", "hi", "hello", "hey"}:
        return ("answered", GREETING_RESPONSE)
    if any(keyword in normalized for keyword in ["고마워", "고맙습니다", "감사", "thank you", "thanks"]):
        return ("answered", THANKS_RESPONSE)
    if any(keyword in normalized for keyword in ["안녕히", "잘가", "잘 가", "수고", "그만", "bye", "goodbye"]):
        return ("answered", GOODBYE_RESPONSE)
    if len(normalized) <= 30 and any(
        keyword in normalized for keyword in ["뭐해", "잘 지내", "괜찮아", "심심", "농담", "how are you"]
    ):
        return ("answered", SMALL_TALK_FIRST_RESPONSE if user_turn_count <= 0 else SMALL_TALK_REDIRECT_RESPONSE)
    return None


def _build_public_runtime_trace(
    *,
    normalized_query: str,
    llm_executed: bool,
    llm_error_code: str | None,
    stream_mode: str,
    user_message_id: str,
    assistant_message_id: str,
    session_id: str,
    session_token: str,
) -> dict[str, Any]:
    return {
        "normalizedQuery": normalized_query,
        "llm": {
            "executed": llm_executed,
            "errorCode": llm_error_code,
            "streamMode": stream_mode,
        },
        "messages": {
            "userMessageId": user_message_id,
            "assistantMessageId": assistant_message_id,
            "sessionId": session_id,
            "sessionToken": session_token,
        },
    }


def _preview(value: str | None, limit: int) -> str | None:
    if not value:
        return None
    compact = " ".join(str(value).split())
    return compact[:limit]


def _safe_score(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _message_type(
    *,
    outcome: str,
    natural_conversation: bool,
    has_candidates: bool,
    llm_error_code: str | None,
    policy_flags: dict[str, Any],
) -> str:
    if llm_error_code:
        return "error"
    if natural_conversation:
        return "greeting"
    if outcome in {"restricted", "conflict", "insufficient_evidence", "escalate"}:
        return "fallback"
    if policy_flags.get("missingEvidence") or policy_flags.get("ambiguousQuestion"):
        return "clarification"
    if has_candidates:
        return "rag"
    return "fallback"


def _fallback_reason(
    *,
    outcome: str,
    decision: str,
    policy_reason: Any,
    policy_flags: dict[str, Any],
    retrieval_output: dict[str, Any] | None,
    llm_error_code: str | None,
) -> str:
    if llm_error_code:
        return "LLM_ERROR"
    retrieval_fallback_reason = (retrieval_output or {}).get("fallbackReason") or (
        ((retrieval_output or {}).get("trace") or {}).get("fallbackReason")
    )
    if retrieval_fallback_reason:
        return str(retrieval_fallback_reason)
    reason = str(policy_reason or "").lower()
    if decision == "restricted" or policy_flags.get("abusiveDetected") or policy_flags.get("restrictedTopic"):
        return "POLICY_BLOCKED"
    if policy_flags.get("unrelatedQuestion") or "out_of_scope" in reason or "unrelated" in reason:
        return "OUT_OF_SCOPE"
    if retrieval_output is not None:
        if not bool(retrieval_output.get("knowledgeAvailable", True)):
            return "NO_KNOWLEDGE"
        retrieved_count = int(retrieval_output.get("retrievedCount") or len(retrieval_output.get("candidates") or []))
        used_count = int(retrieval_output.get("usedInPromptCount") or 0)
        if retrieved_count == 0:
            return "NO_RETRIEVAL_RESULT"
        if used_count == 0:
            return "LOW_RETRIEVAL_SCORE"
    if outcome == "answered":
        return "NONE"
    if retrieval_output is None:
        return "NO_RETRIEVAL_RESULT"
    if decision == "insufficient_evidence" or "evidence" in reason:
        return "NO_KNOWLEDGE"
    return "UNKNOWN"


def _build_admin_debug_trace(
    *,
    outcome: str,
    normalized_query: str,
    retrieval_output: dict[str, Any] | None,
    policy_decision: dict[str, Any] | None,
    answer_settings: Any | None,
    prompt_bundle: dict[str, str] | None,
    prompt_source_count: int,
    llm_executed: bool,
    llm_error_code: str | None,
    exception_type: str | None,
    exception_message: str | None,
    llm_usage: dict[str, Any] | None,
    model_provider: str | None,
    model_name: str | None,
    latency_ms: int,
    retrieval_latency_ms: int | None,
    natural_conversation: bool,
) -> dict[str, Any]:
    candidates = list((retrieval_output or {}).get("candidates") or [])
    used_in_prompt_count = int((retrieval_output or {}).get("usedInPromptCount") or 0)
    top_score = max((_safe_score(item.get("combinedScore")) or 0.0 for item in candidates), default=None)
    policy = policy_decision or {}
    policy_flags = dict(policy.get("flags") or {})
    decision = str(policy.get("decision") or "")
    retrieval_exception_type = (retrieval_output or {}).get("exceptionType") or (
        ((retrieval_output or {}).get("trace") or {}).get("exceptionType")
    )
    retrieval_exception_message = (retrieval_output or {}).get("exceptionMessage") or (
        ((retrieval_output or {}).get("trace") or {}).get("exceptionMessage")
    )
    retrieval_trace = (retrieval_output or {}).get("trace") or {}
    effective_exception_type = exception_type or retrieval_exception_type
    effective_exception_message = exception_message or retrieval_exception_message
    fallback_reason = _fallback_reason(
        outcome=outcome,
        decision=decision,
        policy_reason=policy.get("reason"),
        policy_flags=policy_flags,
        retrieval_output=retrieval_output,
        llm_error_code=llm_error_code,
    )
    chunks = []
    for item in candidates:
        chunk_id = str(item.get("chunkId") or "")
        chunks.append(
            {
                "chunkId": chunk_id or None,
                "knowledgeItemId": item.get("documentId"),
                "sourceType": item.get("sourceType"),
                "sourceTitle": item.get("documentName"),
                "sourceUrl": item.get("sourceUrl"),
                "fileName": item.get("fileName"),
                "sectionTitle": item.get("sectionTitle"),
                "chunkIndex": item.get("chunkIndex"),
                "score": _safe_score(item.get("combinedScore")),
                "vectorScore": _safe_score(item.get("vectorScore")),
                "lexicalScore": _safe_score(item.get("keywordScore")),
                "thresholdPassed": bool(item.get("thresholdPassed")),
                "usedInPrompt": bool(item.get("usedInPrompt")),
                "topicBoostApplied": bool(item.get("topicBoostApplied")),
                "topicBoostTerms": list(item.get("topicBoostTerms") or []),
                "topicPenaltyApplied": bool(item.get("topicPenaltyApplied")),
                "topicPenaltyTerms": list(item.get("topicPenaltyTerms") or []),
                "preview": _preview(str((item.get("contentSignals") or {}).get("textPreview") or ""), 300),
            }
        )
    return {
        "messageType": _message_type(
            outcome=outcome,
            natural_conversation=natural_conversation,
            has_candidates=used_in_prompt_count > 0,
            llm_error_code=llm_error_code,
            policy_flags=policy_flags,
        ),
        "fallbackReason": fallback_reason,
        "latencyMs": latency_ms,
        "policyDecision": policy,
        "retrieval": {
            "enabled": retrieval_output is not None,
            "latencyMs": retrieval_latency_ms,
            "retrievedCount": (retrieval_output or {}).get("retrievedCount", len(candidates)),
            "usedInPromptCount": (retrieval_output or {}).get("usedInPromptCount", prompt_source_count),
            "topScore": top_score,
            "threshold": (retrieval_output or {}).get("retrievalThreshold"),
            "sourceDiversityApplied": bool((retrieval_output or {}).get("sourceDiversityApplied")),
            "filterScope": (retrieval_output or {}).get("filterScope"),
            "fallbackReason": (retrieval_output or {}).get("fallbackReason") or retrieval_trace.get("fallbackReason"),
            "queryEmbeddingGenerated": (retrieval_output or {}).get("queryEmbeddingGenerated"),
            "queryEmbeddingLength": (retrieval_output or {}).get("queryEmbeddingLength"),
            "queryEmbeddingType": (retrieval_output or {}).get("queryEmbeddingType"),
            "exceptionType": retrieval_exception_type,
            "exceptionMessage": retrieval_exception_message,
            "trace": retrieval_trace,
            "chunks": chunks,
        },
        "prompt": {
            "systemPreview": _preview((prompt_bundle or {}).get("systemPrompt"), 500),
            "contextPreview": _preview((prompt_bundle or {}).get("userPrompt"), 1000),
            "contextSourceCount": prompt_source_count,
        },
        "model": {
            "provider": model_provider,
            "name": model_name or (answer_settings.model_runtime.model_name if answer_settings is not None else None),
            "inputTokens": (llm_usage or {}).get("promptTokens"),
            "outputTokens": (llm_usage or {}).get("completionTokens"),
            "latencyMs": (llm_usage or {}).get("latencyMs"),
            "executed": llm_executed,
            "errorCode": llm_error_code,
        },
        "llm": {
            "executed": llm_executed,
            "errorCode": llm_error_code,
            "exceptionType": exception_type,
            "exceptionMessage": exception_message,
            "provider": model_provider,
            "model": model_name or (answer_settings.model_runtime.model_name if answer_settings is not None else None),
            "latencyMs": (llm_usage or {}).get("latencyMs"),
        },
        "exceptionType": effective_exception_type,
        "exceptionMessage": effective_exception_message,
        "normalizedQuery": normalized_query,
    }


def build_chat_pipeline_error_response(
    *,
    body: PreAnswerRequest,
    exc: Exception,
    include_debug_trace: bool,
    stream_mode: str,
) -> ChatRuntimeResponse:
    exception_type = type(exc).__name__
    exception_message = str(exc)[:1000]
    trace: dict[str, Any] = {
        "normalizedQuery": body.normalized_query or normalize_query(body.question),
        "fallbackReason": "UNKNOWN",
        "messageType": "error",
        "retrieval": {
            "enabled": False,
            "retrievedCount": 0,
            "usedInPromptCount": 0,
            "topScore": None,
            "threshold": None,
            "chunks": [],
            "trace": None,
        },
        "prompt": {
            "systemPreview": None,
            "contextPreview": None,
            "contextSourceCount": 0,
        },
        "llm": {
            "executed": False,
            "errorCode": "CHAT_PIPELINE_FAILED",
            "streamMode": stream_mode,
            "exceptionType": exception_type if include_debug_trace else None,
            "exceptionMessage": exception_message if include_debug_trace else None,
        },
        "model": {
            "executed": False,
            "errorCode": "CHAT_PIPELINE_FAILED",
        },
        "policyDecision": {},
        "exceptionType": exception_type if include_debug_trace else None,
        "exceptionMessage": exception_message if include_debug_trace else None,
    }
    return ChatRuntimeResponse(
        request_id=f"chat_error_{uuid.uuid4().hex[:16]}",
        chatbot_id=body.chatbot_id,
        outcome="insufficient_evidence",
        answer={"text": SAFE_CHAT_ERROR_MESSAGE, "warnings": ["CHAT_PIPELINE_RECOVERED_FROM_ERROR"]},
        citations=[],
        policy_decision={},
        trace=trace,
    )


def _build_soft_guidance_response(*, user_turn_count: int) -> str:
    if user_turn_count <= 0:
        return SOFT_GUIDANCE_RESPONSES[0]
    return SOFT_GUIDANCE_RESPONSES[min(user_turn_count, len(SOFT_GUIDANCE_RESPONSES) - 1)]


def _classify_abuse(question: str) -> tuple[bool, str | None, list[str]]:
    normalized = _normalize_text(question)
    matched: list[str] = []
    for severity in ("critical", "high", "medium", "low"):
        keywords = [keyword for keyword in ABUSIVE_KEYWORDS[severity] if keyword in normalized]
        if keywords:
            matched.extend(keywords)
            return True, severity, keywords
    return False, None, matched


def _is_dissatisfied(question: str) -> bool:
    normalized = _normalize_text(question)
    if not normalized:
        return False
    return any(keyword in normalized for keyword in DISSATISFACTION_KEYWORDS)


def _is_contact_question(question: str) -> bool:
    normalized = _normalize_text(question)
    return any(keyword in normalized for keyword in CONTACT_QUESTION_KEYWORDS)


def _is_overseas_intern_qualification_question(question: str) -> bool:
    normalized = _normalize_text(question)
    return any(keyword in normalized for keyword in OVERSEAS_INTERN_KEYWORDS) and any(
        keyword in normalized for keyword in QUALIFICATION_QUESTION_KEYWORDS
    )


def _compact_contact_line(line: str) -> str:
    compact = " ".join(line.replace("☎", "").split())
    compact = re.sub(r"\s+([:：])\s+", r"\1 ", compact)
    phone_match = PHONE_NUMBER_REGEX.search(compact)
    if phone_match:
        preferred_keywords = ["문의처", "연락처", "담당자 전화번호", "전화번호", "담당자"]
        contact_positions = [compact.find(keyword) for keyword in preferred_keywords if keyword in compact]
        contact_positions = [position for position in contact_positions if position >= 0]
        if contact_positions:
            start_anchor = min(contact_positions)
            end = min(len(compact), phone_match.end() + 80)
            compact = compact[start_anchor:end].strip()
        elif len(compact) > 220:
            start = max(0, phone_match.start() - 40)
            end = min(len(compact), phone_match.end() + 80)
            compact = compact[start:end].strip()
    return compact.strip(" -")


def _extract_contact_answer_from_candidates(
    *,
    question: str,
    candidates: list[dict[str, Any]],
    citation_display_mode: str,
) -> str | None:
    if not _is_contact_question(question):
        return None

    normalized_question = _normalize_text(question)
    requires_business_report_contact = any(term in normalized_question for term in BUSINESS_REPORT_CONTACT_TERMS)
    contact_items: list[tuple[int, str]] = []
    for source_index, item in enumerate(candidates[:5], start=1):
        preview = str(item.get("contentSignals", {}).get("textPreview", "") or "")
        candidate_topic_text = " ".join(
            [
                str(item.get("sectionTitle") or ""),
                str(item.get("sourceUrl") or ""),
                preview,
            ]
        )
        if requires_business_report_contact and not any(term in candidate_topic_text for term in BUSINESS_REPORT_CONTACT_TERMS):
            continue
        lines = [line.strip() for line in preview.splitlines() if line.strip()]
        if len(lines) <= 1:
            lines = [part.strip() for part in re.split(r"(?<=[.。])\s+|[•○❍]\s*", preview) if part.strip()]

        for line in lines:
            if not PHONE_NUMBER_REGEX.search(line):
                continue
            if not any(keyword in line for keyword in CONTACT_LINE_KEYWORDS):
                continue
            contact_items.append((source_index, _compact_contact_line(line)))

    if not contact_items:
        return None

    seen: set[str] = set()
    unique_items: list[tuple[int, str]] = []
    for source_index, line in contact_items:
        key = re.sub(r"\s+", " ", line)
        if key in seen:
            continue
        seen.add(key)
        unique_items.append((source_index, line))
        if len(unique_items) >= 3:
            break

    lines: list[str] = []
    for source_index, line in unique_items:
        citation = "" if citation_display_mode == "hidden" else f" [S{source_index}]"
        lines.append(f"- {line}{citation}")

    if requires_business_report_contact:
        lead = "신고업무 담당자 연락처는 다음 근거에서 확인됩니다."
    else:
        lead = "담당자 연락처는 다음 근거에서 확인됩니다."
    return lead + "\n" + "\n".join(lines)


def _clean_qualification_value(line: str) -> str:
    return " ".join(line.replace("※", "").split()).strip(" :-")


def _extract_overseas_intern_qualification_answer(
    *,
    question: str,
    candidates: list[dict[str, Any]],
    citation_display_mode: str,
) -> str | None:
    if not _is_overseas_intern_qualification_question(question):
        return None

    for source_index, item in enumerate(candidates[:8], start=1):
        preview = str(item.get("contentSignals", {}).get("textPreview", "") or "")
        if not any(anchor in preview for anchor in INTERN_QUALIFICATION_ANCHORS):
            continue

        lines = [_clean_qualification_value(line) for line in preview.splitlines()]
        lines = [line for line in lines if line]
        start_index = next(
            (
                index
                for index, line in enumerate(lines)
                if "인턴사원 선발자격" in line or line == "인턴사원"
            ),
            0,
        )
        window = lines[start_index : start_index + 14]

        selected: list[str] = []
        for line in window:
            if any(
                marker in line
                for marker in [
                    "선발인원",
                    "취업 의지가 분명한 자",
                    "응시연령",
                    "학 력",
                    "학력",
                    "현지에서 근무 가능한 자",
                    "기업 자체선발",
                ]
            ):
                selected.append(line)

        if not selected:
            continue

        citation = "" if citation_display_mode == "hidden" else f" [S{source_index}]"
        bullets = "\n".join(f"- {line}" for line in selected[:6])
        return f"해외인턴 인턴사원 선발자격은 다음과 같습니다.{citation}\n{bullets}"

    return None


def _conversation_tone_summary(
    *,
    question: str,
    recent_messages: list[Any],
) -> dict[str, Any]:
    abusive_detected, abusive_severity, abusive_keywords = _classify_abuse(question)
    dissatisfied_current = _is_dissatisfied(question)
    previous_dissatisfied = 0
    previous_problem_assistant = 0

    for message in recent_messages:
        if message.role == "user":
            tone = dict(message.metadata_json or {}).get("conversationTone") or {}
            if tone.get("dissatisfied") or _is_dissatisfied(message.content):
                previous_dissatisfied += 1
        elif message.role == "assistant" and (message.result_type or "") in {
            "insufficient_evidence",
            "clarification",
            "restricted",
            "conflict",
            "escalate",
        }:
            previous_problem_assistant += 1

    repeated_dissatisfaction = dissatisfied_current and (
        previous_dissatisfied >= 1 or previous_problem_assistant >= 1
    )

    return {
        "abusiveDetected": abusive_detected,
        "abusiveSeverity": abusive_severity,
        "abusiveKeywords": abusive_keywords,
        "dissatisfied": dissatisfied_current,
        "previousDissatisfiedCount": previous_dissatisfied,
        "previousProblemAssistantCount": previous_problem_assistant,
        "repeatedUserDissatisfaction": repeated_dissatisfaction,
    }


def _split_candidate_preview(preview: str) -> list[str]:
    normalized = re.sub(r"\[URL\]\s+https?://\S+", "", preview or "", flags=re.IGNORECASE)
    parts = re.split(r"\n+|\s+/\s+|(?<=[.!?。])\s+", normalized)
    cleaned: list[str] = []
    for part in parts:
        line = " ".join(part.split()).strip(" -·")
        if not line or len(line) < 2:
            continue
        cleaned.append(line)
    return cleaned


def _is_overview_business_question(question: str) -> bool:
    normalized = _normalize_text(question)
    return any(keyword in normalized for keyword in ["주요 사업", "주요사업", "사업", "소개", "어떤 일", "무슨 일"])


def _extract_business_items(lines: list[str]) -> list[str]:
    stop_keywords = ["관련법령", "해외시장정보", "해외농업투자정보", "자원개발신고", "소통알림", "협회소개"]
    skip_terms = {
        "주요사업",
        "KOREA OADS",
        "세계 속의 우리농업!",
        "해외농업자원개발협회가 함꼐 합니다.",
        "바로가기 메뉴",
        "본문 바로가기",
        "주메뉴 바로가기",
        "검색",
        "KOR",
        "ENG",
        "메뉴",
        "닫기",
    }
    seen: set[str] = set()
    items: list[str] = []
    inside_business_section = False
    for line in lines:
        if "주요사업" in line:
            inside_business_section = True
            continue
        if inside_business_section and any(keyword in line for keyword in stop_keywords):
            break
        if not inside_business_section:
            continue
        if line in skip_terms or len(line) > 60:
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(line)
        if len(items) >= 30:
            break
    return items


def _build_business_overview_from_lines(lines: list[str]) -> list[str]:
    available = set(lines)
    grouped_items = [
        ("인력양성", ["지역분야별 특화교육", "국제곡물 전문가 교육", "진출기업 보수교육", "해외인턴"]),
        ("조사지원", ["민간환경조사"]),
        ("컨설팅", ["상시 컨설팅"]),
        ("해외농업연계 국제개발협력 지원사업", []),
        ("해외농업개척조사", []),
        ("포럼/워크숍", ["비즈니스 다이얼로그", "행사소개", "행사소식"]),
        ("해외농업 전문관", []),
        ("융자지원", []),
        ("국내반입 및 투자촉진 지원", []),
        ("할당관세/수입권공매", []),
        ("안전성 검사", []),
        ("개발도상국 투자보증보험 지원", []),
    ]

    bullets: list[str] = []
    for title, children in grouped_items:
        if title not in available and not any(child in available for child in children):
            continue
        matched_children = [child for child in children if child in available]
        if matched_children:
            bullets.append(f"{title}: {', '.join(matched_children)}")
        else:
            bullets.append(title)
    return bullets


def _build_extractive_answer_from_candidates(
    *,
    question: str,
    candidates: list[dict[str, Any]],
    citation_display_mode: str,
) -> str | None:
    if not candidates:
        return None

    if _is_overview_business_question(question):
        best_source_index = 1
        best_business_items: list[str] = []
        for source_index, item in enumerate(candidates[:8], start=1):
            preview = str(item.get("contentSignals", {}).get("textPreview", "") or "")
            lines = _split_candidate_preview(preview)
            business_items = _extract_business_items(lines)
            grouped_items = _build_business_overview_from_lines(business_items)
            selected_items = grouped_items or business_items
            if len(selected_items) > len(best_business_items):
                best_source_index = source_index
                best_business_items = selected_items

        if best_business_items:
            citation = "" if citation_display_mode == "hidden" else f" [S{best_source_index}]"
            bullets = "\n".join(f"- {item}" for item in best_business_items[:12])
            return (
                f"확인된 자료 기준으로 주요 사업은 다음과 같습니다.{citation}\n\n"
                f"{bullets}\n\n"
                "사업별 세부 대상, 신청 방법, 일정은 공고와 운영 시기에 따라 달라질 수 있어 "
                "해당 사업 공고를 함께 확인하는 것이 좋습니다."
            )

    selected: list[tuple[int, str]] = []
    seen_lines: set[str] = set()
    for source_index, item in enumerate(candidates[:3], start=1):
        preview = str(item.get("contentSignals", {}).get("textPreview", "") or "")
        for line in _split_candidate_preview(preview):
            if line in seen_lines or len(line) < 12 or len(line) > 220:
                continue
            seen_lines.add(line)
            selected.append((source_index, line))
            if len(selected) >= 4:
                break
        if len(selected) >= 4:
            break

    if not selected:
        return None

    bullets = []
    for source_index, line in selected:
        source_marker = "" if citation_display_mode == "hidden" else f" [S{source_index}]"
        bullets.append(f"- {line}{source_marker}")
    return "확인된 자료에서 다음 내용을 찾았습니다.\n\n" + "\n".join(bullets)


def _run_grounded_generation(
    db: Session,
    *,
    body: PreAnswerRequest,
    chatbot: Any,
    normalized_query: str,
    retrieval_output: dict[str, Any],
    answer_settings: Any,
    guardrail_eval: dict[str, Any],
) -> dict[str, Any]:
    prompt_bundle = build_answer_prompt(
        question=body.question,
        normalized_query=normalized_query,
        candidates=retrieval_output.get("promptCandidates") or [],
        settings=answer_settings,
        requires_cautious_wording=bool(guardrail_eval.get("requiresCautiousWording")),
        requires_warning_notice=bool(guardrail_eval.get("requiresWarningNotice")),
    )
    generation = generate_grounded_answer(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        prompt_bundle=prompt_bundle,
        answer_settings=answer_settings,
    )
    generation["promptBundle"] = prompt_bundle
    return generation


def _persist_immediate_response(
    db: Session,
    *,
    body: PreAnswerRequest,
    chatbot: Any,
    session: Any,
    session_token: str,
    normalized_query: str,
    stream_mode: str,
    tone_summary: dict[str, Any],
    outcome: str,
    answer_text: str,
    reason: str,
) -> ChatRuntimeResponse:
    request_id = f"chat_run_{uuid.uuid4().hex[:16]}"
    if session is None:
        session = create_chat_session(
            db,
            organization_id=str(chatbot.organization_id),
            chatbot_id=str(chatbot.id),
            session_token=session_token,
            source_url=body.source_url,
        )
    elif body.source_url and not session.source_url:
        session.source_url = body.source_url

    user_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="user",
        content=body.question,
        status="completed",
        model_name=None,
        result_type=None,
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision={},
        validation_signals={},
        metadata_json={"conversationTone": tone_summary},
    )
    assistant_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="assistant",
        content=answer_text,
        status="completed",
        model_name=None,
        result_type=outcome,
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision={"decision": "allow", "reason": reason, "flags": {"immediateResponse": True}},
        validation_signals={"immediateResponse": True},
        metadata_json={"conversationTone": tone_summary},
    )

    create_audit_log(
        db,
        organization_id=str(chatbot.organization_id),
        admin_id=None,
        action="chat.final_pipeline.executed",
        target_type="chatbot",
        target_id=str(chatbot.id),
        result="success",
        request_id=request_id,
        metadata_json={
            "outcome": outcome,
            "streamMode": stream_mode,
            "llmExecuted": False,
            "llmErrorCode": None,
            "policyDecision": "allow",
            "reason": reason,
            "retrievalSummary": [],
            "citationSummary": [],
        },
    )

    session.last_message_at = datetime.now(UTC)
    db.commit()

    return ChatRuntimeResponse(
        request_id=request_id,
        chatbot_id=str(chatbot.id),
        outcome=outcome,
        answer={"text": answer_text, "warnings": []},
        citations=[],
        policy_decision={},
        trace=_build_public_runtime_trace(
            normalized_query=normalized_query,
            llm_executed=False,
            llm_error_code=None,
            stream_mode=stream_mode,
            user_message_id=str(user_message.id),
            assistant_message_id=str(assistant_message.id),
            session_id=str(session.id),
            session_token=session_token,
        ),
    )


def run_final_chat_pipeline(
    db: Session,
    *,
    body: PreAnswerRequest,
    stream_mode: str = "non_stream",
    include_debug_trace: bool = False,
) -> ChatRuntimeResponse:
    total_start = time.perf_counter()
    chatbot = get_chatbot_by_id(db, body.chatbot_id)
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    _, chatbot = ensure_runtime_access_for_chatbot(db, chatbot_id=str(chatbot.id))
    check_conversation_limit(db, chatbot_id=str(chatbot.id))

    normalized_query = body.normalized_query or normalize_query(body.question)
    session_token = body.session_token or f"session_{uuid.uuid4().hex[:20]}"
    immediate_response = _simple_natural_response(body.question, user_turn_count=0)
    if immediate_response is not None:
        outcome, answer_text = immediate_response
        response = _persist_immediate_response(
            db,
            body=body,
            chatbot=chatbot,
            session=None,
            session_token=session_token,
            normalized_query=normalized_query,
            stream_mode=stream_mode,
            tone_summary=_conversation_tone_summary(question=body.question, recent_messages=[]),
            outcome=outcome,
            answer_text=answer_text,
            reason="simple_natural_conversation",
        )
        if include_debug_trace:
            response.policy_decision = {"decision": "allow", "reason": "simple_natural_conversation", "flags": {}}
            response.trace = _build_admin_debug_trace(
                outcome=outcome,
                normalized_query=normalized_query,
                retrieval_output=None,
                policy_decision={"decision": "allow", "reason": "simple_natural_conversation", "flags": {}},
                answer_settings=None,
                prompt_bundle=None,
                prompt_source_count=0,
                llm_executed=False,
                llm_error_code=None,
                exception_type=None,
                exception_message=None,
                llm_usage={},
                model_provider=None,
                model_name=None,
                latency_ms=int((time.perf_counter() - total_start) * 1000),
                retrieval_latency_ms=None,
                natural_conversation=True,
            )
        return response

    session = get_chat_session_by_token(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_token=session_token,
    )
    user_turn_count = count_user_messages_in_session(db, session_id=str(session.id)) if session is not None else 0
    recent_messages = list_recent_session_messages(db, session_id=str(session.id), limit=8) if session is not None else []
    tone_summary = _conversation_tone_summary(question=body.question, recent_messages=recent_messages)

    retrieval_start = time.perf_counter()
    retrieval_output = retrieve_for_precheck(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        question=body.question,
        top_k=body.top_k,
        corpus_domain_policy=chatbot.corpus_domain_policy or {},
        search_control_policy=chatbot.search_control_policy or {},
    )
    retrieval_latency_ms = int((time.perf_counter() - retrieval_start) * 1000)
    if not retrieval_output.get("retrievalLatencyMs"):
        retrieval_output["retrievalLatencyMs"] = retrieval_latency_ms
    prompt_candidates = list(retrieval_output.get("promptCandidates") or [])

    answer_settings = get_effective_answer_settings_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )
    runtime_guardrails = get_effective_guardrails_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )

    policy_decision = evaluate_answer_policy(
        {
            "question": body.question,
            "normalizedQuery": normalized_query,
            "retrievedCandidates": prompt_candidates,
            "appliedRules": retrieval_output["trace"],
            "answerSettings": answer_settings,
            "answerValidationPolicy": chatbot.answer_validation_policy or {},
            "guardrailPolicy": chatbot.guardrail_policy or {},
            "runtimeGuardrails": runtime_guardrails,
            "repeatedUserDissatisfaction": tone_summary["repeatedUserDissatisfaction"],
            "abusiveSeverity": tone_summary["abusiveSeverity"],
        }
    )
    runtime_escalation_config = get_effective_escalation_rules_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )
    escalation_mapping = map_escalation_target_for_runtime(
        policy_decision=policy_decision,
        runtime_escalation_config=runtime_escalation_config,
    )
    policy_decision["escalation"] = escalation_mapping
    guardrail_eval = policy_decision.get("guardrailEvaluation") or {}
    decision = str(policy_decision.get("decision") or "insufficient_evidence")
    policy_flags = policy_decision.get("flags") or {}

    citations = assemble_citations(
        candidates=prompt_candidates,
        citation_display_mode=answer_settings.answer_format.citation_display_mode,
    )
    direct_contact_answer = _extract_contact_answer_from_candidates(
        question=body.question,
        candidates=prompt_candidates,
        citation_display_mode=answer_settings.answer_format.citation_display_mode,
    )
    direct_intern_qualification_answer = _extract_overseas_intern_qualification_answer(
        question=body.question,
        candidates=prompt_candidates,
        citation_display_mode=answer_settings.answer_format.citation_display_mode,
    )

    answer_text = ""
    warnings: list[str] = []
    llm_executed = False
    llm_error_code: str | None = None
    exception_type: str | None = None
    exception_message: str | None = None
    llm_usage: dict[str, Any] = {}
    prompt_bundle: dict[str, str] | None = None
    prompt_source_count = 0
    model_provider: str | None = None
    model_name: str | None = answer_settings.model_runtime.model_name

    greeting_detected = bool(policy_flags.get("greetingDetected"))
    gratitude_detected = bool(policy_flags.get("gratitudeDetected"))
    small_talk_detected = bool(policy_flags.get("smallTalkDetected"))
    abusive_detected = bool(policy_flags.get("abusiveDetected"))
    natural_conversation = greeting_detected or gratitude_detected or small_talk_detected
    has_candidates = bool(prompt_candidates)
    has_referenceable_candidates = bool(citations)
    can_try_grounded_answer = (
        has_candidates
        and not abusive_detected
        and not natural_conversation
        and not policy_flags.get("unrelatedQuestion")
        and decision not in {"restricted", "conflict"}
    )

    if direct_intern_qualification_answer and not abusive_detected:
        outcome = "answered"
        answer_text = direct_intern_qualification_answer
    elif direct_contact_answer and not abusive_detected:
        outcome = "answered"
        answer_text = direct_contact_answer
    elif abusive_detected:
        outcome = "restricted"
        answer_text = str(
            policy_decision.get("safeMessage")
            or "원활한 안내를 위해 정중한 표현으로 다시 말씀해 주세요. 업무 관련 질문은 계속 도와드릴 수 있습니다."
        )
    elif greeting_detected:
        outcome = "answered"
        answer_text = GREETING_RESPONSE
    elif gratitude_detected:
        outcome = "answered"
        answer_text = THANKS_RESPONSE
    elif small_talk_detected:
        outcome = "answered"
        answer_text = SMALL_TALK_FIRST_RESPONSE if user_turn_count <= 0 else SMALL_TALK_REDIRECT_RESPONSE
    elif (decision == "allow" and has_candidates) or can_try_grounded_answer:
        generation = _run_grounded_generation(
            db,
            body=body,
            chatbot=chatbot,
            normalized_query=normalized_query,
            retrieval_output=retrieval_output,
            answer_settings=answer_settings,
            guardrail_eval=guardrail_eval,
        )
        llm_executed = bool(generation.get("executed"))
        llm_error_code = generation.get("errorCode")
        exception_type = generation.get("exceptionType") if isinstance(generation.get("exceptionType"), str) else None
        exception_message = (
            generation.get("exceptionMessage") if isinstance(generation.get("exceptionMessage"), str) else None
        )
        llm_usage = dict(generation.get("usage") or {})
        prompt_bundle = generation.get("promptBundle") if isinstance(generation.get("promptBundle"), dict) else None
        prompt_source_count = len(prompt_candidates) if prompt_bundle else 0
        model_provider = generation.get("provider") if isinstance(generation.get("provider"), str) else None
        model_name = generation.get("model") if isinstance(generation.get("model"), str) else model_name
        used_count = int(retrieval_output.get("usedInPromptCount") or 0)
        if prompt_source_count != used_count:
            logger.warning(
                "[RAG_THRESHOLD] prompt_context_mismatch organization_id=%s chatbot_id=%s context_sources=%s used=%s",
                chatbot.organization_id,
                chatbot.id,
                prompt_source_count,
                used_count,
            )

        if generation.get("text"):
            answer_text = str(generation["text"])
            if guardrail_eval.get("requiresWarningNotice"):
                warnings.append("최신 기준이나 공고 조건에 따라 결과가 달라질 수 있으므로 담당 부서 확인이 필요합니다.")
            outcome = "answered"
        elif llm_error_code and has_referenceable_candidates:
            extractive_answer = _build_extractive_answer_from_candidates(
                question=body.question,
                candidates=prompt_candidates,
                citation_display_mode=answer_settings.answer_format.citation_display_mode,
            )
            if extractive_answer:
                outcome = "answered"
                answer_text = extractive_answer
                warnings.append("자동 생성 답변을 만들 수 없어 색인된 근거에서 확인되는 내용으로 안내했습니다.")
            else:
                fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
                outcome = fallback["outcome"] if fallback["outcome"] != "answered" else "escalate"
                answer_text = fallback["text"]
                warnings = fallback.get("warnings", [])
                warnings.append("자동 응답 처리 중 오류가 있어 안전 안내 문구로 전환했습니다.")
        elif (
            decision in {"insufficient_evidence", "conflict", "escalate"}
            and not policy_flags.get("unrelatedQuestion")
            and user_turn_count < 2
        ):
            outcome = "answered"
            answer_text = _build_soft_guidance_response(user_turn_count=user_turn_count)
        else:
            fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
            outcome = fallback["outcome"] if fallback["outcome"] != "answered" else "escalate"
            answer_text = fallback["text"]
            warnings = fallback.get("warnings", [])
            if llm_error_code:
                warnings.append("자동 응답 처리 중 오류가 있어 안전 안내 문구로 전환했습니다.")
    elif (
        decision in {"insufficient_evidence", "conflict", "escalate"}
        and not policy_flags.get("unrelatedQuestion")
        and user_turn_count < 2
    ):
        outcome = "answered"
        answer_text = _build_soft_guidance_response(user_turn_count=user_turn_count)
    else:
        fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
        outcome = fallback["outcome"]
        answer_text = fallback["text"]
        warnings = fallback.get("warnings", [])

    if (
        outcome == "answered"
        and answer_settings.answer_policy.require_citations
        and not has_referenceable_candidates
        and not natural_conversation
    ):
        fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
        outcome = "insufficient_evidence"
        answer_text = fallback["text"]
        llm_executed = False
        warnings.append("인용 가능한 근거가 없어 안전 안내 문구로 전환했습니다.")

    fallback_reason_for_log = _fallback_reason(
        outcome=outcome,
        decision=decision,
        policy_reason=policy_decision.get("reason"),
        policy_flags=policy_flags,
        retrieval_output=retrieval_output,
        llm_error_code=llm_error_code,
    )
    logger.info(
        "[RAG_THRESHOLD] organization_id=%s chatbot_id=%s threshold=%s retrieved=%s used=%s top_score=%s fallback_reason=%s",
        chatbot.organization_id,
        chatbot.id,
        retrieval_output.get("retrievalThreshold"),
        retrieval_output.get("retrievedCount", len(retrieval_output.get("candidates") or [])),
        retrieval_output.get("usedInPromptCount", len(prompt_candidates)),
        max(
            (_safe_score(item.get("combinedScore")) or 0.0 for item in retrieval_output.get("candidates") or []),
            default=None,
        ),
        fallback_reason_for_log,
    )

    request_id = f"chat_run_{uuid.uuid4().hex[:16]}"
    if session is None:
        session = create_chat_session(
            db,
            organization_id=str(chatbot.organization_id),
            chatbot_id=str(chatbot.id),
            session_token=session_token,
            source_url=body.source_url,
        )
    elif body.source_url and not session.source_url:
        session.source_url = body.source_url

    user_message_metadata = {
        "conversationTone": tone_summary,
    }
    assistant_message_metadata = {
        "conversationTone": {
            "abusiveDetected": abusive_detected,
            "abusiveSeverity": tone_summary.get("abusiveSeverity"),
            "repeatedUserDissatisfaction": bool(policy_flags.get("repeatedUserDissatisfaction")),
            "gratitudeDetected": gratitude_detected,
            "smallTalkDetected": small_talk_detected,
        }
    }

    user_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="user",
        content=body.question,
        status="completed",
        model_name=None,
        result_type=None,
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision={},
        validation_signals={},
        metadata_json=user_message_metadata,
    )
    assistant_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="assistant",
        content=answer_text,
        status="completed",
        model_name=answer_settings.model_runtime.model_name if llm_executed else None,
        result_type=outcome,
        normalized_query=normalized_query,
        retrieved_documents=retrieval_output["candidates"],
        selected_sources=citations,
        final_decision=policy_decision,
        validation_signals=policy_decision.get("flags", {}),
        metadata_json=assistant_message_metadata,
        escalation_reason=(
            policy_decision.get("reason")
            if outcome in {"escalate", "restricted", "conflict", "insufficient_evidence"}
            else None
        ),
        escalation_target_department=(
            escalation_mapping.get("targetDepartment")
            if outcome in {"escalate", "restricted", "conflict", "insufficient_evidence"}
            else None
        ),
        escalation_target_queue=(
            escalation_mapping.get("targetQueue")
            if outcome in {"escalate", "restricted", "conflict", "insufficient_evidence"}
            else None
        ),
    )
    if citations:
        create_citations(
            db,
            organization_id=str(chatbot.organization_id),
            chat_message_id=str(assistant_message.id),
            citations=citations,
        )

    create_audit_log(
        db,
        organization_id=str(chatbot.organization_id),
        admin_id=None,
        action="chat.final_pipeline.executed",
        target_type="chatbot",
        target_id=str(chatbot.id),
        result="success",
        request_id=request_id,
        metadata_json={
            "outcome": outcome,
            "streamMode": stream_mode,
            "llmExecuted": llm_executed,
            "llmErrorCode": llm_error_code,
            "policyDecision": decision,
            "reason": policy_decision.get("reason"),
            "escalationMapping": escalation_mapping,
            "guardrailMatchedRuleIds": guardrail_eval.get("matchedRuleIds", []),
            "safety": {
                "abusiveDetected": abusive_detected,
                "abusiveSeverity": tone_summary.get("abusiveSeverity"),
                "abusiveKeywords": tone_summary.get("abusiveKeywords", []),
                "dissatisfied": tone_summary.get("dissatisfied"),
                "repeatedUserDissatisfaction": tone_summary.get("repeatedUserDissatisfaction"),
            },
            "retrievalSummary": [
                {
                    "documentId": item.get("documentId"),
                    "documentVersionId": item.get("documentVersionId"),
                    "rank": item.get("finalRank"),
                    "score": item.get("combinedScore"),
                }
                for item in retrieval_output["candidates"][:5]
            ],
            "effectiveSettingsSummary": {
                "assistantRoleMode": answer_settings.prompt_instruction.assistant_role_mode,
                "toneMode": answer_settings.prompt_instruction.tone_mode,
                "answerStyleMode": answer_settings.prompt_instruction.answer_style_mode,
                "requireCitations": answer_settings.answer_policy.require_citations,
                "modelName": answer_settings.model_runtime.model_name,
                "temperature": answer_settings.model_runtime.temperature,
                "maxTokens": answer_settings.model_runtime.max_tokens,
            },
            "citationSummary": [
                {
                    "documentId": item.get("documentId"),
                    "documentVersionId": item.get("documentVersionId"),
                    "pageNumber": item.get("pageNumber"),
                    "sectionTitle": item.get("sectionTitle"),
                    "rank": item.get("finalRank"),
                }
                for item in citations
            ],
        },
    )

    session.last_message_at = datetime.now(UTC)
    db.commit()

    public_trace = _build_public_runtime_trace(
        normalized_query=normalized_query,
        llm_executed=llm_executed,
        llm_error_code=llm_error_code,
        stream_mode=stream_mode,
        user_message_id=str(user_message.id),
        assistant_message_id=str(assistant_message.id),
        session_id=str(session.id),
        session_token=session_token,
    )
    if include_debug_trace:
        public_trace = _build_admin_debug_trace(
            outcome=outcome,
            normalized_query=normalized_query,
            retrieval_output=retrieval_output,
            policy_decision=policy_decision,
            answer_settings=answer_settings,
            prompt_bundle=prompt_bundle,
            prompt_source_count=prompt_source_count,
            llm_executed=llm_executed,
            llm_error_code=llm_error_code,
            exception_type=exception_type,
            exception_message=exception_message,
            llm_usage=llm_usage,
            model_provider=model_provider,
            model_name=model_name,
            latency_ms=int((time.perf_counter() - total_start) * 1000),
            retrieval_latency_ms=retrieval_latency_ms,
            natural_conversation=natural_conversation,
        )

    return ChatRuntimeResponse(
        request_id=request_id,
        chatbot_id=str(chatbot.id),
        outcome=outcome,
        answer={"text": answer_text, "warnings": warnings},
        citations=citations,
        policy_decision=policy_decision if include_debug_trace else {},
        trace=public_trace,
    )

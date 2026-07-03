import logging
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings

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
from app.schemas.chat_runtime import (
    ChunkDetail,
    ChatRuntimeResponse,
    ListResponse,
    PerformanceMetrics,
    TextResponse,
    ViewResponse,
)
from app.services.chat import answer_cache as _answer_cache
from app.services.chat.answer_generation_service import generate_grounded_answer
from app.services.chat.entity_extraction_service import (
    extract_entities_from_turn,
    format_entities_for_prompt,
    merge_context_entities,
)
from app.services.chat.citation_service import assemble_citations
from app.services.chat.fallback_response_service import build_fallback_response
from app.services.chat.intent_classifier_service import (
    IntentClassification,
    classify_intent,
    generate_natural_intent_response,
)
from app.services.chat.policy_evaluation_service import evaluate_answer_policy
from app.services.chat.privacy_guard_service import PrivacyDetectionResult, detect_and_mask_privacy
from app.services.chat.prompt_assembly_service import build_answer_prompt
from app.services.chat.retrieval_precheck_service import normalize_query, retrieve_for_precheck
from app.services.enforcement_service import ensure_runtime_access_for_chatbot
from app.services.escalations.runtime_escalation_service import (
    get_effective_escalation_rules_for_runtime,
    map_escalation_target_for_runtime,
)
from app.services.guardrails.runtime_guardrails_service import get_effective_guardrails_for_runtime
from app.services.limits_service import check_conversation_limit
from app.services.monitoring import langfuse_service
from app.services.settings.answer_settings_service import get_effective_answer_settings_for_runtime

logger = logging.getLogger(__name__)

# USE_DYNAMIC_FOLLOWUP=true 이면 LLM으로 follow-up 질문 동적 생성
# false(기본) 이면 기존 키워드 규칙 기반 유지
_USE_DYNAMIC_FOLLOWUP: bool = settings.use_dynamic_followup

SAFE_CHAT_ERROR_MESSAGE = (
    "현재 자동 답변 처리에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주시거나, "
    "질문을 조금 더 구체적으로 남겨주시면 확인 가능한 범위에서 다시 안내해 드리겠습니다."
)
PRIVACY_BLOCK_RESPONSE = (
    "개인정보가 포함된 내용은 보안을 위해 처리할 수 없습니다. "
    "전화번호, 주민등록번호, 카드번호, 생년월일 등은 제외하고 다시 입력해 주세요."
)

GREETING_RESPONSE = "안녕하세요! 무엇을 도와드릴까요? "
THANKS_RESPONSE = "도움이 되었다니 다행이에요. 또 궁금한 점이 있으면 말씀해 주세요 "
GOODBYE_RESPONSE = "감사합니다. 좋은 하루 보내세요!"
COMPLIMENT_RESPONSE = "좋게 봐주셔서 감사합니다. 궁금하신 내용이 있으면 편하게 물어봐 주세요 "
WEATHER_RESPONSE = "그러게요, 기분 좋은 날씨네요! 다른 궁금한 점이 있으면 언제든 말씀해 주세요 "
FUN_RESPONSE = "재미있으셨다니 다행이에요! 더 궁금한 점 있으면 언제든 말씀해 주세요 "
EMOTION_RESPONSE = "말씀해 주셔서 감사합니다. 필요한 내용이 있으면 편하게 물어봐 주세요 "
SMALL_TALK_FIRST_RESPONSE = "편하게 말씀해 주세요. 궁금하신 점이 있으면 바로 도와드릴게요 "
SMALL_TALK_REDIRECT_RESPONSE = "궁금하신 내용이 있으면 언제든 말씀해 주세요 "
OUT_OF_SCOPE_RESPONSE = "죄송하지만 기관 업무 안내 범위 밖의 내용은 답변하기 어렵습니다. 사업, 신청, 자격, 서류 등 궁금하신 내용을 말씀해 주세요 "
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
PHONE_NUMBER_REGEX = re.compile(r"(?:\d{2,3}[-.)]\d{3,4}[-.)]\d{4}|\d{2,3}\.\d{3,4}\.\d{4})")
BUSINESS_SIGNAL_KEYWORDS = [
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
    "공단",
    "시설",
    "서비스",
    "정책",
    "절차",
    "대상",
    "기간",
    "마감",
    "접수",
    "소개",
    "문의처",
]

NATURAL_INTENT_RESPONSES = {
    "greeting": GREETING_RESPONSE,
    "thanks": THANKS_RESPONSE,
    "goodbye": GOODBYE_RESPONSE,
    "compliment": COMPLIMENT_RESPONSE,
    "weather": WEATHER_RESPONSE,
    "fun": FUN_RESPONSE,
    "emotion": EMOTION_RESPONSE,
}
FALLBACK_FOLLOW_UP_QUESTIONS = [
    "관련 사업명을 알려주실 수 있나요?",
    "신청 단계나 대상 기관을 알려주실 수 있나요?",
    "찾고 싶은 자료명을 알려주실 수 있나요?",
]


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _has_business_signal(normalized: str) -> bool:
    return any(keyword in normalized for keyword in BUSINESS_SIGNAL_KEYWORDS)


def _detect_simple_intent(question: str) -> str | None:
    normalized = _normalize_text(question)
    if not normalized:
        return None

    if _has_business_signal(normalized):
        return None

    normalized_for_intent = normalized.strip(" .!?。！？")
    compact = normalized_for_intent.replace(" ", "")
    if compact in {"안녕", "안녕하세요"} or normalized in {"hi", "hello", "hey"}:
        return "greeting"
    if any(keyword in normalized for keyword in ["고마워", "고맙습니다", "감사", "thank you", "thanks", "thx"]):
        return "thanks"
    if any(keyword in normalized for keyword in ["안녕히", "잘가", "잘 가", "수고", "그만", "bye", "goodbye"]):
        return "goodbye"
    return None


def _simple_natural_response(question: str, *, user_turn_count: int) -> tuple[str, str, str] | None:
    detected_intent = _detect_simple_intent(question)
    if detected_intent is None:
        return None
    if detected_intent == "smalltalk":
        response = SMALL_TALK_FIRST_RESPONSE if user_turn_count <= 0 else SMALL_TALK_REDIRECT_RESPONSE
    else:
        response = NATURAL_INTENT_RESPONSES[detected_intent]
    return ("answered", response, detected_intent)


def _fallback_natural_response(intent: str, *, user_turn_count: int) -> str:
    if intent == "goodbye":
        return GOODBYE_RESPONSE
    if intent in NATURAL_INTENT_RESPONSES:
        return NATURAL_INTENT_RESPONSES[intent]
    return SMALL_TALK_FIRST_RESPONSE if user_turn_count <= 0 else SMALL_TALK_REDIRECT_RESPONSE


OVERVIEW_QUESTION_TERMS = (
    "주요사업",
    "주요 사업",
    "지원사업",
    "사업 소개",
    "기관 소개",
    "무슨 일",
    "하는 일",
    "무엇을 하나",
    "뭐 하는",
    "소개",
    "개요",
)


def _is_overview_followup_question(question: str) -> bool:
    normalized = _normalize_text(question)
    return any(term in normalized for term in OVERVIEW_QUESTION_TERMS)


def _clean_candidate_snippet(value: str, *, limit: int = 140) -> str:
    normalized = re.sub(r"\s+", " ", value).strip(" -\n\t")
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rsplit(" ", 1)[0].strip() + "..."


def _build_extractive_overview_answer(
    *,
    question: str,
    candidates: list[dict[str, Any]],
    chatbot_name: str,
    institution_name: str,
) -> str | None:
    if not _is_overview_followup_question(question) or not candidates:
        return None

    items: list[tuple[str, str]] = []
    seen: set[str] = set()
    for candidate in candidates[:5]:
        title = str(
            candidate.get("sectionTitle")
            or candidate.get("documentName")
            or candidate.get("sourceTitle")
            or candidate.get("title")
            or ""
        ).strip()
        signals = candidate.get("contentSignals") if isinstance(candidate.get("contentSignals"), dict) else {}
        preview = str(signals.get("textPreview") or "").strip()
        if not title and not preview:
            continue
        title = title or "관련 자료"
        key = re.sub(r"\s+", "", f"{title}:{preview[:80]}").lower()
        if key in seen:
            continue
        seen.add(key)
        items.append((title, _clean_candidate_snippet(preview or title)))
        if len(items) == 4:
            break

    if not items:
        return None

    subject = institution_name.strip() or chatbot_name.strip() or "해당 기관"
    lines = [
        f"{subject}의 주요 사업은 현재 검색된 공식 자료 기준으로 아래 항목을 중심으로 확인됩니다.",
        "",
    ]
    for index, (title, preview) in enumerate(items, start=1):
        lines.append(f"{index}. {title}")
        if preview and preview != title:
            lines.append(f"- {preview}")
    lines.extend(
        [
            "",
            "세부 신청 자격, 기간, 제출서류는 사업별 공고나 안내 페이지 기준으로 다시 확인하는 것이 좋습니다.",
        ]
    )
    return "\n".join(lines)


def _candidate_text(candidates: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for item in candidates[:5]:
        for key in ("sectionTitle", "sourceTitle", "documentName", "title"):
            value = item.get(key)
            if value:
                parts.append(str(value))
        signals = item.get("contentSignals")
        if isinstance(signals, dict) and signals.get("textPreview"):
            parts.append(str(signals.get("textPreview")))
    return _normalize_text(" ".join(parts))


def _follow_up_key(value: str) -> str:
    return re.sub(r"[\s?？!.。]+", "", value.strip())


def _dedupe_three(items: list[str], *, exclude: str | None = None) -> list[str]:
    result: list[str] = []
    exclude_key = _follow_up_key(exclude) if exclude else None
    for item in items:
        normalized = " ".join(item.split())
        if normalized and normalized not in result and _follow_up_key(normalized) != exclude_key:
            result.append(normalized)
        if len(result) == 3:
            break
    return result


def _generate_followup_with_llm(
    question: str,
    answer_text: str,
    db: Any,
) -> list[str]:
    """LLM follow-up 질문 동적 생성. 실패 시 [] 반환."""
    import json as _json  # noqa: PLC0415
    import re as _re  # noqa: PLC0415
    import sys  # noqa: PLC0415

    from app.services.chat.answer_generation_service import (  # noqa: PLC0415
        _call_anthropic,
        _call_openai_like,
        _extract_output_text_anthropic,
        _extract_output_text_openai,
    )
    from app.services.llm_api_config_runtime_service import (  # noqa: PLC0415
        resolve_runtime_api_config as _resolve,
    )

    sys.stderr.write(f"[FOLLOWUP] 진입: {question[:20]}\n")
    sys.stderr.flush()

    try:
        runtime_api = _resolve(db)
    except Exception as e:
        sys.stderr.write(f"[FOLLOWUP] resolve_runtime_api 예외: {e}\n")
        sys.stderr.flush()
        return []

    if runtime_api is None:
        return []

    model = runtime_api.speed_model()  # 팔로우업 질문: 속도 우선
    system_prompt = "follow-up 질문 생성 전문가입니다. JSON 배열만 출력하세요. 설명 없이."
    user_prompt = (
        "다음 대화를 보고 사용자가 이어서 물어볼 법한 질문 3개를 만들어주세요.\n\n"
        f"질문: {question}\n"
        f"답변: {answer_text[:600]}\n\n"
        "규칙:\n"
        "- 답변에서 언급된 구체적인 내용과 직접 관련된 질문\n"
        "- 사용자가 실제로 다음에 궁금해할 만한 것\n"
        "- 각 질문은 30자 이내의 간결한 한국어\n"
        "- 원래 질문과 중복 금지\n"
        '- 질문 형식으로 끝낼 것 ("~인가요?", "~어떻게 되나요?" 등)\n\n'
        'JSON 배열로만 응답 예시: ["신청 마감일은 언제인가요?", "제출 서류는 어디서 받나요?", "합격 후 절차는 어떻게 되나요?"]'
    )

    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                temperature=0.3,
                max_output_tokens=200,
                top_p=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout_seconds=10,
            )
            raw_text = _extract_output_text_anthropic(response_json)
        else:
            response_json = _call_openai_like(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                temperature=0.3,
                max_output_tokens=200,
                top_p=None,
                frequency_penalty=None,
                presence_penalty=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout_seconds=10,
            )
            raw_text = _extract_output_text_openai(response_json)
    except Exception as e:
        sys.stderr.write(f"[FOLLOWUP] LLM 호출 예외: {e}\n")
        sys.stderr.flush()
        return []

    # ── JSON 파싱 ─────────────────────────────────────────────────────────────
    raw_text = (raw_text or "").strip()
    match = _re.search(r"\[.*?\]", raw_text, _re.DOTALL)
    if not match:
        sys.stderr.write(f"[FOLLOWUP] JSON배열 없음. raw={raw_text[:100]}\n")
        sys.stderr.flush()
        return []

    try:
        parsed = _json.loads(match.group(0))
    except Exception as e:
        sys.stderr.write(f"[FOLLOWUP] JSON파싱 실패: {e}\n")
        sys.stderr.flush()
        return []

    if not isinstance(parsed, list):
        return []

    result_list = [str(q).strip() for q in parsed if isinstance(q, str) and q.strip()]
    sys.stderr.write(f"[FOLLOWUP] 파싱결과={result_list}\n")
    sys.stderr.flush()
    return result_list


def _rule_based_follow_up(
    question: str,
    answer_text: str,
    candidates: list[dict[str, Any]],
) -> list[str]:
    """기존 키워드 규칙 기반 follow-up 생성. LLM fallback 시 사용."""
    normalized = _normalize_text(question)
    answer_context = _normalize_text(answer_text)
    # 추천 질문 주제 판단은 질문+답변 기준만 사용한다.
    # 검색된 청크 텍스트(source)를 섞으면 "교육" 같은 흔한 단어 하나가
    # 전혀 다른 주제(예: 퇴직연금 질문 → 교육 신청 추천)를 유발하므로 제외.
    context_text = f"{normalized} {answer_context}"

    if "융자" in context_text:
        return _dedupe_three(
            ["융자 신청 자격은 어떻게 되나요?", "융자 신청 시 제출 서류는 무엇인가요?", "융자 금리와 상환 조건은 어떻게 되나요?"],
            exclude=question,
        )
    if "사업신고" in context_text or "변경신고" in context_text:
        return _dedupe_three(
            ["사업신고 절차는 어떻게 되나요?", "사업신고 시 필요한 서류는 무엇인가요?", "변경신고는 언제 해야 하나요?"],
            exclude=question,
        )
    if "교육" in context_text or "해외인턴" in context_text or "인턴" in context_text:
        return _dedupe_three(
            ["교육 신청 자격은 어떻게 되나요?", "모집 기간은 언제인가요?", "제출 서류는 무엇인가요?"],
            exclude=question,
        )
    if any(keyword in context_text for keyword in ["기관 소개", "사업 소개", "주요 사업", "주요사업", "소개"]):
        return _dedupe_three(
            ["주요 지원사업은 무엇인가요?", "신청 가능한 사업은 어떤 것이 있나요?", "문의처는 어디인가요?"],
            exclude=question,
        )

    source_driven: list[str] = []
    if "자격" in context_text or "조건" in context_text:
        source_driven.append("신청 자격은 어떻게 되나요?")
    if "서류" in context_text or "제출" in context_text:
        source_driven.append("제출 서류는 무엇인가요?")
    if "기간" in context_text or "모집" in context_text or "마감" in context_text:
        source_driven.append("신청 기간은 언제인가요?")
    if "문의" in context_text or "연락" in context_text or "담당" in context_text:
        source_driven.append("문의처는 어디인가요?")

    return _dedupe_three(
        source_driven + ["관련 사업명을 알려주실 수 있나요?", "신청 단계나 대상 기관을 알려주실 수 있나요?",
                         "찾고 싶은 자료명을 알려주실 수 있나요?"],
        exclude=question,
    )


_KO_STOPWORDS = {
    "은", "는", "이", "가", "을", "를", "의", "에", "에서", "으로", "로",
    "와", "과", "도", "만", "이다", "입니다", "했", "하는", "있는", "없는",
    "하면", "있으면", "어떻게", "무엇", "언제", "어디", "왜", "누구",
}


def _keyword_select_from_pool(
    question: str,
    answer_text: str,
    pool: list[str],
) -> list[str]:
    """
    사전 등록 질문 풀에서 현재 Q&A와 키워드 오버랩이 높은 상위 3개 선택.
    오버랩이 없는 항목은 제외하되, 부족하면 풀에서 순서대로 보완.
    """
    if not pool:
        return []

    context_words = set((question + " " + answer_text).lower().split()) - _KO_STOPWORDS

    scored: list[tuple[int, str]] = []
    for q in pool:
        q_words = set(q.lower().split()) - _KO_STOPWORDS
        overlap = len(context_words & q_words)
        scored.append((overlap, q))

    scored.sort(key=lambda x: x[0], reverse=True)
    # 오버랩 있는 것 우선, 없으면 순서대로
    result = [q for score, q in scored if score > 0][:3]
    if len(result) < 3:
        extra = [q for score, q in scored if score == 0][: 3 - len(result)]
        result += extra

    return result[:3]


def _llm_select_from_pool(
    question: str,
    answer_text: str,
    pool: list[str],
    db: Any,
) -> list[str]:
    """
    LLM에게 풀 목록 + 현재 Q&A를 주고 가장 관련성 높은 3개 번호 선택 요청.
    실패 시 [] 반환 → 호출자가 키워드 방식으로 폴백.
    """
    import json as _json
    import re as _re

    from app.services.chat.answer_generation_service import (  # noqa: PLC0415
        _call_anthropic,
        _call_openai_like,
        _extract_output_text_anthropic,
        _extract_output_text_openai,
    )
    from app.services.llm_api_config_runtime_service import resolve_runtime_api_config as _resolve  # noqa: PLC0415

    try:
        runtime_api = _resolve(db)
    except Exception:
        return []
    if runtime_api is None:
        return []

    pool_text = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(pool[:30]))
    system_prompt = "JSON 배열만 출력하세요. 설명 없이."
    user_prompt = (
        "현재 대화:\n"
        f"질문: {question}\n"
        f"답변: {answer_text[:400]}\n\n"
        "아래 질문 목록에서 사용자가 다음으로 물어볼 가능성이 가장 높은 질문 3개의 번호를\n"
        "JSON 배열로 응답하세요. 예: [1, 5, 12]\n\n"
        f"질문 목록:\n{pool_text}"
    )

    model = runtime_api.speed_model()  # 풀 기반 질문 선택: 속도 우선

    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                temperature=0,
                max_output_tokens=60,
                top_p=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout_seconds=5,
            )
            raw = _extract_output_text_anthropic(response_json)
        else:
            response_json = _call_openai_like(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model,
                temperature=0,
                max_output_tokens=60,
                top_p=None,
                frequency_penalty=None,
                presence_penalty=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout_seconds=5,
            )
            raw = _extract_output_text_openai(response_json)

        m = _re.search(r"\[[\d,\s]+\]", raw)
        if not m:
            return []
        indices = _json.loads(m.group(0))
        return [pool[i - 1] for i in indices if isinstance(i, int) and 1 <= i <= len(pool)][:3]
    except Exception:
        return []


def _build_follow_up_questions(
    question: str,
    answer_text: str,
    outcome: str,
    candidates: list[dict[str, Any]],
    db: Any,
    natural_conversation: bool = False,
    privacy_blocked: bool = False,
    question_pool: list[str] | None = None,
    follow_up_enabled: bool = True,
) -> list[str]:
    if natural_conversation or privacy_blocked or not follow_up_enabled:
        return []
    if outcome != "answered":
        return FALLBACK_FOLLOW_UP_QUESTIONS.copy()

    # ── 풀 기반 선택 (관리자가 사전 등록한 질문 풀) ───────────────────────────
    if question_pool:
        if _USE_DYNAMIC_FOLLOWUP and db is not None:
            # LLM이 풀에서 관련성 높은 3개 선택 (더 정확)
            selected = _llm_select_from_pool(question, answer_text, question_pool, db)
            if selected:
                return selected
        # LLM 미사용 또는 실패 시 키워드 오버랩으로 선택
        keyword_selected = _keyword_select_from_pool(question, answer_text, question_pool)
        if keyword_selected:
            return keyword_selected

    # ── 풀 없음: 기존 동적/규칙 생성 ─────────────────────────────────────────
    if _USE_DYNAMIC_FOLLOWUP and db is not None:
        result = _generate_followup_with_llm(question, answer_text, db)
        if result:
            return result[:3]

    return _rule_based_follow_up(question, answer_text, candidates)


def _log_unanswered(
    *,
    chatbot_id: str,
    organization_id: str,
    question: str,
    search_score: float | None,
    outcome: str,
    session_id: str,
) -> None:
    """
    미답변 질문을 unanswered_logs 테이블에 기록.

    - 새 DB 세션을 열어 메인 세션과 격리
    - 실패해도 예외를 re-raise 하지 않아 메인 응답에 영향 없음
    - 개인정보가 포함된 질문은 마스킹 후 저장
    """
    try:
        from app.db import SessionLocal  # noqa: PLC0415
        from app.models.unanswered_log import UnansweredLog  # noqa: PLC0415
        from app.services.chat.privacy_guard_service import detect_and_mask_privacy  # noqa: PLC0415

        masked = detect_and_mask_privacy(question)
        safe_question = masked.masked_text if masked.detected else question

        with SessionLocal() as log_db:
            log_db.add(
                UnansweredLog(
                    organization_id=uuid.UUID(organization_id),
                    chatbot_id=uuid.UUID(chatbot_id),
                    question=safe_question[:1000],
                    search_score=search_score,
                    outcome=outcome,
                    session_id=session_id[:100] if session_id else None,
                    status="pending",
                )
            )
            log_db.commit()
    except Exception as exc:
        logger.warning("[UNANSWERED_LOG] 기록 실패: %s", exc)


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
    detected_intent: str | None = None,
    intent_routing_method: str | None = None,
    intent_confidence: float | None = None,
    classifier_reason: str | None = None,
    simple_response_applied: bool = False,
    follow_up_questions: list[str] | None = None,
    follow_up_source: str | None = None,
) -> dict[str, Any]:
    return {
        "normalizedQuery": normalized_query,
        "intentRoutingMethod": intent_routing_method,
        "detectedIntent": detected_intent,
        "intentConfidence": intent_confidence,
        "classifierReason": classifier_reason,
        "simpleResponseApplied": simple_response_applied,
        "followUpQuestions": follow_up_questions or [],
        "followUpSource": follow_up_source,
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
                "dynamicThreshold": _safe_score(item.get("dynamicThreshold")),
                "thresholdPassed": bool(item.get("thresholdPassed")),
                "usedInPrompt": bool(item.get("usedInPrompt")),
                "semanticEvidenceApplied": bool(item.get("semanticEvidenceApplied")),
                "semanticEvidenceReason": item.get("semanticEvidenceReason"),
                "semanticRescued": bool(item.get("semanticRescued")),
                "overviewRescued": bool(item.get("overviewRescued")),
                "matchedKeywords": list(item.get("matchedKeywords") or []),
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
            "dynamicThreshold": retrieval_trace.get("dynamicThreshold"),
            "promptChunkCount": retrieval_trace.get("promptChunkCount", prompt_source_count),
            "scopeDiagnostics": (retrieval_output or {}).get("scopeDiagnostics") or retrieval_trace.get("scopeDiagnostics"),
            "searchableChunkCount": retrieval_trace.get("searchableChunkCount"),
            "excludedChunkCountByReason": retrieval_trace.get("excludedChunkCountByReason", {}),
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
        "followUpQuestions": FALLBACK_FOLLOW_UP_QUESTIONS.copy(),
        "followUpSource": "rule_based",
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
        follow_up_questions=FALLBACK_FOLLOW_UP_QUESTIONS.copy(),
        policy_decision={},
        trace=trace,
    )


def _build_soft_guidance_response(
    *,
    user_turn_count: int,
    answer_settings: Any = None,
) -> str:
    # tenant 설정값 우선 사용, 없으면 하드코딩 폴백
    if answer_settings is not None:
        configured = (
            answer_settings.answer_policy.fallback_message_when_insufficient_evidence
            or ""
        ).strip()
        if configured:
            return configured

    # 기존 하드코딩 동작 유지 (설정값 없을 때)
    if user_turn_count <= 0:
        return SOFT_GUIDANCE_RESPONSES[0]
    return SOFT_GUIDANCE_RESPONSES[min(user_turn_count, len(SOFT_GUIDANCE_RESPONSES) - 1)]


def _rag_settings_dict(answer_settings: Any) -> dict[str, Any]:
    rag = getattr(answer_settings, "rag", None)
    if rag is None:
        return {}
    if hasattr(rag, "model_dump"):
        return rag.model_dump(by_alias=True)
    if isinstance(rag, dict):
        return dict(rag)
    return {}


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
) -> str | None:
    if not _is_contact_question(question):
        return None

    contact_items: list[tuple[int, str]] = []
    for source_index, item in enumerate(candidates[:5], start=1):
        preview = str(item.get("contentSignals", {}).get("textPreview", "") or "")
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

    result_lines: list[str] = []
    for _source_index, line in unique_items:
        result_lines.append(f"- {line}")

    return "담당자 연락처는 다음 근거에서 확인됩니다.\n" + "\n".join(result_lines)




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




def _run_grounded_generation(
    db: Session,
    *,
    body: PreAnswerRequest,
    chatbot: Any,
    normalized_query: str,
    retrieval_output: dict[str, Any],
    answer_settings: Any,
    guardrail_eval: dict[str, Any],
    chatbot_name: str = "",
    institution_name: str = "",
    recent_messages: list[Any] | None = None,
    question_type_flags: dict | None = None,
    uncovered_slots: list[str] | None = None,
    session_entities: dict | None = None,
    api_context: str | None = None,
) -> dict[str, Any]:
    # 기관별 custom_instructions: 마이그레이션 미실행 환경에서는 graceful fallback
    _custom_instr = ""
    try:
        _custom_instr = str(getattr(chatbot, "custom_instructions", "") or "")
    except Exception:
        pass

    prompt_bundle = build_answer_prompt(
        question=body.question,
        normalized_query=normalized_query,
        candidates=retrieval_output.get("promptCandidates") or [],
        settings=answer_settings,
        requires_cautious_wording=bool(guardrail_eval.get("requiresCautiousWording")),
        requires_warning_notice=bool(guardrail_eval.get("requiresWarningNotice")),
        chatbot_name=chatbot_name,
        institution_name=institution_name,
        recent_messages=recent_messages,
        question_type_flags=question_type_flags,
        uncovered_slots=uncovered_slots,
        session_entities=session_entities,
        custom_instructions=_custom_instr,
        api_context=api_context,
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
    detected_intent: str,
    intent_routing_method: str = "rule",
    intent_confidence: float | None = 1.0,
    classifier_reason: str | None = None,
    model_name: str | None = None,
    citations: list[Any] | None = None,
    follow_up_questions: list[str] | None = None,
    structured_response: Any = None,
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
        model_name=model_name,
        result_type=outcome,
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision={
            "decision": "allow",
            "reason": reason,
            "flags": {
                "immediateResponse": True,
                "detectedIntent": detected_intent,
                "intentRoutingMethod": intent_routing_method,
                "intentConfidence": intent_confidence,
                "classifierReason": classifier_reason,
            },
        },
        validation_signals={
            "immediateResponse": True,
            "detectedIntent": detected_intent,
            "intentRoutingMethod": intent_routing_method,
            "intentConfidence": intent_confidence,
            "classifierReason": classifier_reason,
        },
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
            "intentRoutingMethod": intent_routing_method,
            "detectedIntent": detected_intent,
            "intentConfidence": intent_confidence,
            "classifierReason": classifier_reason,
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
        citations=list(citations or []),
        follow_up_questions=list(follow_up_questions or []),
        policy_decision={},
        structured_response=structured_response,
        trace=_build_public_runtime_trace(
            normalized_query=normalized_query,
            llm_executed=False,
            llm_error_code=None,
            stream_mode=stream_mode,
            user_message_id=str(user_message.id),
            assistant_message_id=str(assistant_message.id),
            session_id=str(session.id),
            session_token=session_token,
            detected_intent=detected_intent,
            intent_routing_method=intent_routing_method,
            intent_confidence=intent_confidence,
            classifier_reason=classifier_reason,
            simple_response_applied=True,
            follow_up_questions=list(follow_up_questions or []),
            follow_up_source=None,
        ),
    )


def _persist_privacy_block_response(
    db: Session,
    *,
    body: PreAnswerRequest,
    chatbot: Any,
    session: Any,
    session_token: str,
    normalized_query: str,
    stream_mode: str,
    privacy_result: PrivacyDetectionResult,
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

    privacy_flags = {
        "privacyDetected": True,
        "privacyTypes": privacy_result.types,
        "maskedInput": privacy_result.masked_text,
    }
    final_decision = {
        "decision": "restricted",
        "reason": "privacy_detected",
        "flags": privacy_flags,
        "safeMessage": PRIVACY_BLOCK_RESPONSE,
    }

    user_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="user",
        content=body.question,
        content_masked=privacy_result.masked_text,
        status="completed",
        model_name=None,
        result_type=None,
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision={},
        validation_signals=privacy_flags,
        metadata_json={"privacy": privacy_flags},
    )
    assistant_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="assistant",
        content=PRIVACY_BLOCK_RESPONSE,
        status="completed",
        model_name=None,
        result_type="restricted",
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision=final_decision,
        validation_signals=privacy_flags,
        metadata_json={"privacy": privacy_flags},
        escalation_reason="privacy_detected",
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
            "outcome": "restricted",
            "streamMode": stream_mode,
            "llmExecuted": False,
            "llmErrorCode": None,
            "policyDecision": "restricted",
            "reason": "privacy_detected",
            "privacy": privacy_flags,
            "retrievalSummary": [],
            "citationSummary": [],
        },
    )

    session.last_message_at = datetime.now(UTC)
    db.commit()

    trace = _build_public_runtime_trace(
        normalized_query=normalized_query,
        llm_executed=False,
        llm_error_code=None,
        stream_mode=stream_mode,
        user_message_id=str(user_message.id),
        assistant_message_id=str(assistant_message.id),
        session_id=str(session.id),
        session_token=session_token,
    )
    trace.update(privacy_flags)

    return ChatRuntimeResponse(
        request_id=request_id,
        chatbot_id=str(chatbot.id),
        outcome="restricted",
        answer={"text": PRIVACY_BLOCK_RESPONSE, "warnings": ["PRIVACY_DETECTED"]},
        citations=[],
        follow_up_questions=[],
        policy_decision={},
        trace=trace,
    )


def run_final_chat_pipeline(
    db: Session,
    *,
    body: PreAnswerRequest,
    stream_mode: str = "non_stream",
    include_debug_trace: bool = False,
) -> ChatRuntimeResponse:
    total_start = time.perf_counter()
    # 단계별 성능 측정 (Sprint 3-E) — debug_mode=True 일 때 ChatRuntimeResponse 에 포함
    _perf_intent_ms: int | None = None
    _perf_rewrite_ms: int | None = None
    _perf_retrieval_ms: int | None = None
    _perf_rerank_ms: int | None = None
    _perf_api_ms: int | None = None
    _perf_llm_ms: int | None = None
    logger.info("[PIPELINE] start chatbot_id=%s question_len=%s", body.chatbot_id, len(body.question or ""))
    try:
        chatbot = get_chatbot_by_id(db, body.chatbot_id)
        if chatbot is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
        logger.info("[PIPELINE] chatbot_found id=%s", chatbot.id)
        organization, chatbot = ensure_runtime_access_for_chatbot(db, chatbot_id=str(chatbot.id))
        logger.info("[PIPELINE] access_ok org_id=%s", chatbot.organization_id)
        check_conversation_limit(db, chatbot_id=str(chatbot.id))
        logger.info("[PIPELINE] limit_ok")
    except Exception as _early_exc:
        logger.exception("[PIPELINE] FAILED early-stage chatbot_id=%s", body.chatbot_id)
        raise

    session_token = body.session_token or f"session_{uuid.uuid4().hex[:20]}"
    # 답변 설정 조기 로드 (개인정보 처리 모드 등 결정에 필요) — 이후 재사용
    answer_settings = get_effective_answer_settings_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )
    # ── 개인정보(PII) 자동 처리 — LLM 전송·트레이스·로그 저장 전에 비식별화 ──
    privacy_result = detect_and_mask_privacy(body.question)
    if privacy_result.detected:
        if answer_settings.answer_policy.privacy_input_mode == "block":
            session = get_chat_session_by_token(
                db,
                organization_id=str(chatbot.organization_id),
                chatbot_id=str(chatbot.id),
                session_token=session_token,
            )
            return _persist_privacy_block_response(
                db,
                body=body,
                chatbot=chatbot,
                session=session,
                session_token=session_token,
                normalized_query=body.normalized_query or normalize_query(body.question),
                stream_mode=stream_mode,
                privacy_result=privacy_result,
            )
        # mask 모드: 개인정보를 가린 질의로 이후 전 과정(RAG·LLM·로그) 진행
        body.question = privacy_result.masked_text
        body.normalized_query = None
    normalized_query = body.normalized_query or normalize_query(body.question)
    langfuse_service.start_chat_trace(
        question=body.question,
        chatbot_id=str(chatbot.id),
        session_token=session_token,
    )

    # ── 보안 분석 (Sprint 3-B) ────────────────────────────────────────────────
    # privacy 체크 통과 후 → 비정상 접근/부적절 발언/부정 감정 탐지
    # should_block=True → 즉시 차단 / False → 기록만
    try:
        from app.services.security_guard_service import (  # noqa: PLC0415
            analyze_security,
            log_security_event,
        )
        _sec = analyze_security(
            question=body.question,
            chatbot_id=str(chatbot.id),
            session_id=session_token,
            db=db,
        )
        if _sec.has_event:
            log_security_event(
                chatbot_id=str(chatbot.id),
                organization_id=str(chatbot.organization_id),
                session_id=session_token,
                event_type=_sec.event_type or "unknown",
                severity=_sec.severity or "low",
                question_masked=body.question,
                detected_patterns=_sec.detected_patterns,
                ai_response="blocked" if _sec.should_block else "answered",
            )
            if _sec.should_block:
                return ChatRuntimeResponse(
                    request_id=request_id,
                    chatbot_id=str(chatbot.id),
                    outcome="restricted",
                    answer={"text": "보안 정책에 따라 답변이 제한됩니다.", "warnings": ["SECURITY_BLOCKED"]},
                    citations=[],
                    follow_up_questions=[],
                    conditional_actions=[],
                    policy_decision={},
                    trace={},
                )
    except Exception as _sec_exc:
        logger.warning("[SECURITY] 보안 분석 skipped: %s", _sec_exc)

    immediate_response = _simple_natural_response(body.question, user_turn_count=0)
    if immediate_response is not None:
        outcome, answer_text, detected_intent = immediate_response
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
            detected_intent=detected_intent,
        )
        if include_debug_trace:
            response.policy_decision = {
                "decision": "allow",
                "reason": "simple_natural_conversation",
                "flags": {
                    "detectedIntent": detected_intent,
                    "intentRoutingMethod": "rule",
                    "intentConfidence": 1.0,
                    "simpleResponseApplied": True,
                },
            }
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
            response.trace["detectedIntent"] = detected_intent
            response.trace["intentRoutingMethod"] = "rule"
            response.trace["intentConfidence"] = 1.0
            response.trace["classifierReason"] = None
            response.trace["simpleResponseApplied"] = True
        return response

    session = get_chat_session_by_token(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_token=session_token,
    )
    user_turn_count = count_user_messages_in_session(db, session_id=str(session.id)) if session is not None else 0
    recent_messages = list_recent_session_messages(db, session_id=str(session.id), limit=8) if session is not None else []

    # ── 긍정 답변("네") → 직전 AI 제안 이어받기 ──────────────────────────────
    # "네/응/알려줘" 같은 동의가 직전 '…안내해 드릴까요?' 제안을 가리키면, 그 제안 주제를
    # 독립 질문으로 복원해 body.question을 치환한다. 이후 분류기·검색·프롬프트가
    # 실제 질문을 보고 정상 답변하게 된다 (일반 질문엔 영향 없음).
    if recent_messages:
        try:
            from app.services.chat.query_rewriter_service import resolve_affirmation_followup  # noqa: PLC0415
            _affirm_q, _affirmed = resolve_affirmation_followup(
                current_query=body.question,
                recent_messages=recent_messages,
                db=db,
            )
            if _affirmed:
                print(f"[AFFIRM_REWRITE] '{body.question}' → '{_affirm_q[:40]}'", flush=True)
                body.question = _affirm_q
                normalized_query = normalize_query(_affirm_q)
        except Exception as _af_exc:
            logger.warning("[AFFIRM_REWRITE] skipped: %s", _af_exc)

    # ── 시맨틱 답변 캐시 조회 (USE_ANSWER_CACHE=true 일 때만) ──────────────────
    # 1턴 + outcome=answered 의 chatbot+question 조합만 캐시. TTL 내 동일 질문 재시도 시
    # LLM/RAG 전체 우회 → ~13초 → ~50ms. 무효화는 TTL만 사용(지식/FAQ 변경 시 stale 가능).
    _cache_skip, _cache_skip_reason = _answer_cache.should_skip(recent_messages=recent_messages)
    if not _cache_skip:
        _cached_answer = _answer_cache.get_cached(str(chatbot.id), body.question)
        if _cached_answer is not None:
            tone_summary = _conversation_tone_summary(question=body.question, recent_messages=recent_messages)
            response = _persist_immediate_response(
                db,
                body=body,
                chatbot=chatbot,
                session=session,
                session_token=session_token,
                normalized_query=normalized_query,
                stream_mode=stream_mode,
                tone_summary=tone_summary,
                outcome=_cached_answer.get("outcome", "answered"),
                answer_text=_cached_answer.get("answerText", ""),
                reason="answer_cache_hit",
                detected_intent="business_question",
                intent_routing_method="cache",
                intent_confidence=1.0,
                classifier_reason=None,
                model_name=None,
                citations=_cached_answer.get("citations") or [],
                follow_up_questions=_cached_answer.get("followUpQuestions") or [],
                structured_response=_cached_answer.get("structuredResponse"),
            )
            return response

    # 세션 엔티티 로드 (컬럼 미존재 시 안전하게 None으로 폴백)
    session_entities: dict | None = None
    if session is not None:
        try:
            session_entities = session.context_entities
        except Exception:
            db.rollback()
    tone_summary = _conversation_tone_summary(question=body.question, recent_messages=recent_messages)
    # answer_settings는 파이프라인 초입(개인정보 처리 전)에서 이미 로드됨 — 재사용
    intent_routing_method = "rag_default"
    detected_intent: str | None = None
    intent_confidence: float | None = None
    classifier_reason: str | None = None
    classifier_usage: dict[str, Any] = {}
    classifier_model_provider: str | None = None
    classifier_model_name: str | None = None

    # API 연동 트리거 우선: 관리자가 명시 등록한 API 트리거가 질문과 매칭되면
    # 의도분류기(out_of_scope/자연어 조기반환)와 FAQ 조기반환을 건너뛰고 RAG+API 경로로
    # 진행한다. 분류기가 "범위 밖"으로 판단해도 관리자 설정 트리거는 항상 발동되게 함.
    force_api = False
    try:
        from app.services.chat.api_connector_service import should_use_api as _should_use_api  # noqa: PLC0415
        if _should_use_api(body.question, str(chatbot.id), db):
            force_api = True
            logger.info("[API_CONNECTOR] 트리거 매칭 → 분류기/FAQ 조기반환 우회")
    except Exception as _fa_exc:
        logger.warning("[API_CONNECTOR] 트리거 우선 판정 실패: %s", _fa_exc)

    business_signal_detected = _has_business_signal(_normalize_text(body.question))
    _t0 = time.perf_counter()
    if not business_signal_detected and not force_api:
        classification: IntentClassification = classify_intent(
            db,
            organization_id=str(chatbot.organization_id),
            chatbot_id=str(chatbot.id),
            question=body.question,
            answer_settings=answer_settings,
        )
        classifier_usage = dict(classification.usage or {})
        _perf_intent_ms = int((time.perf_counter() - _t0) * 1000)
        classifier_model_provider = classification.provider
        classifier_model_name = classification.model
        if classification.executed:
            intent_routing_method = "llm_classifier"
            detected_intent = classification.intent
            intent_confidence = classification.confidence
            classifier_reason = classification.reason or classification.error_code

        if classification.intent and classification.confidence >= 0.7:
            if classification.intent == "business_question":
                intent_routing_method = "rag_default"
            elif classification.intent == "out_of_scope":
                return _persist_immediate_response(
                    db,
                    body=body,
                    chatbot=chatbot,
                    session=session,
                    session_token=session_token,
                    normalized_query=normalized_query,
                    stream_mode=stream_mode,
                    tone_summary=tone_summary,
                    outcome="insufficient_evidence",
                    answer_text=OUT_OF_SCOPE_RESPONSE,
                    reason="intent_classifier_out_of_scope",
                    detected_intent="out_of_scope",
                    intent_routing_method="llm_classifier",
                    intent_confidence=classification.confidence,
                    classifier_reason=classification.reason,
                    model_name=classification.model,
                )
            elif classification.intent in {
                "greeting",
                "thanks",
                "goodbye",
                "compliment",
                "weather",
                "emotion",
                "smalltalk",
            }:
                natural_generation = generate_natural_intent_response(
                    db,
                    organization_id=str(chatbot.organization_id),
                    chatbot_id=str(chatbot.id),
                    question=body.question,
                    intent=classification.intent,
                    answer_settings=answer_settings,
                )
                natural_text = natural_generation.text or _fallback_natural_response(
                    classification.intent,
                    user_turn_count=user_turn_count,
                )
                return _persist_immediate_response(
                    db,
                    body=body,
                    chatbot=chatbot,
                    session=session,
                    session_token=session_token,
                    normalized_query=normalized_query,
                    stream_mode=stream_mode,
                    tone_summary=tone_summary,
                    outcome="answered",
                    answer_text=natural_text,
                    reason="intent_classifier_natural_conversation",
                    detected_intent=classification.intent,
                    intent_routing_method="llm_classifier",
                    intent_confidence=classification.confidence,
                    classifier_reason=classification.reason,
                    model_name=natural_generation.model or classification.model,
                )

    # ── 쿼리 리라이팅 (멀티턴 맥락 기반, Sprint 2-A) ─────────────────────────
    search_query = body.question
    _t0 = time.perf_counter()
    if recent_messages:
        try:
            from app.services.chat.query_rewriter_service import rewrite_query  # noqa: PLC0415
            search_query, _was_rewritten = rewrite_query(
                current_query=body.question,
                recent_messages=recent_messages,
                db=db,
            )
            if _was_rewritten:
                print(f"[QUERY_REWRITE] '{body.question[:30]}' → '{search_query[:30]}'", flush=True)
        except Exception as _rw_exc:
            logger.warning("[QUERY_REWRITE] 리라이팅 skipped: %s", _rw_exc)
            search_query = body.question
    _perf_rewrite_ms = int((time.perf_counter() - _t0) * 1000)

    # ── 외부 API 컨텍스트 조회 (Sprint 3-D) ─────────────────────────────────
    api_context: str | None = None
    api_structured_response: TextResponse | ViewResponse | ListResponse | None = None
    _t0 = time.perf_counter()
    try:
        from app.services.chat.api_connector_service import get_api_result  # noqa: PLC0415
        api_context, api_structured_response = get_api_result(
            question=body.question,
            chatbot_id=str(chatbot.id),
            db=db,
        )
        if api_context:
            logger.info("[API_CONNECTOR] 컨텍스트 주입 len=%d structured=%s", len(api_context), api_structured_response is not None)
    except Exception as _api_exc:
        logger.warning("[API_CONNECTOR] skipped: %s", _api_exc)
    _perf_api_ms = int((time.perf_counter() - _t0) * 1000)

    # ── FAQ 우선 검색 ─────────────────────────────────────────────────────────
    # 등록된 FAQ와 시맨틱 유사도가 임계값 이상이면 RAG 없이 FAQ 답변으로 즉시 반환
    faq_match: dict | None = None
    try:
        from app.services.admin.faq_service import search_faq_by_question  # noqa: PLC0415
        faq_match = search_faq_by_question(
            db,
            chatbot_id=str(chatbot.id),
            query=search_query,
        )
    except Exception as _faq_exc:
        logger.warning("[FAQ] search skipped: %s", _faq_exc)

    if faq_match is not None and not force_api:
        logger.info("[FAQ] matched score=%.3f → early return", faq_match["score"])
        return _persist_immediate_response(
            db,
            body=body,
            chatbot=chatbot,
            session=session,
            session_token=session_token,
            normalized_query=normalized_query,
            stream_mode=stream_mode,
            tone_summary=tone_summary,
            outcome="answered",
            answer_text=faq_match["answer"],
            reason="faq_match",
            detected_intent=detected_intent or "",
            intent_routing_method=intent_routing_method,
            intent_confidence=intent_confidence,
            classifier_reason=classifier_reason,
        )

    retrieval_start = time.perf_counter()
    retrieval_output = retrieve_for_precheck(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        question=search_query,
        top_k=body.top_k,
        corpus_domain_policy=chatbot.corpus_domain_policy or {},
        search_control_policy=chatbot.search_control_policy or {},
        rag_settings=_rag_settings_dict(answer_settings),
    )
    retrieval_latency_ms = int((time.perf_counter() - retrieval_start) * 1000)
    _perf_retrieval_ms = retrieval_latency_ms
    if not retrieval_output.get("retrievalLatencyMs"):
        retrieval_output["retrievalLatencyMs"] = retrieval_latency_ms
    prompt_candidates = list(retrieval_output.get("promptCandidates") or [])
    langfuse_service.record_retrieval(candidates=prompt_candidates, latency_ms=retrieval_latency_ms)

    # ── Re-ranking (USE_RERANKING=true 일 때만 실행) ──────────────────────────
    # 전체 candidates(top-20 이내) 를 LLM 관련성 점수로 재정렬 → top_n 선별
    # 결과로 promptCandidates 만 교체; retrieval_output 나머지 구조는 유지
    # USE_RERANKING=false(기본) 이면 early-return으로 기존 동작과 100% 동일
    try:
        from app.services.chat.reranker_service import rerank_chunks  # noqa: PLC0415
        all_candidates = list(retrieval_output.get("candidates") or prompt_candidates)
        _rerank_start = time.perf_counter()
        reranked = rerank_chunks(db, query=body.question, chunks=all_candidates)
        # 실제로 재정렬된 경우(_reranked 마커가 붙은 결과)에만 교체한다.
        # 비활성(USE_RERANKING=false)·실패·후보부족 시 rerank_chunks는 마커 없는
        # 슬라이스를 반환하므로, 큐레이션된 promptCandidates(threshold·다양성 선별)를
        # 그대로 유지한다. (이전 `is not` 비교는 항상 참이라 기본 경로에서도 선별을
        # 우회하던 버그였음)
        if reranked and reranked[0].get("_reranked"):
            retrieval_output["promptCandidates"] = reranked
            prompt_candidates = reranked
            _perf_rerank_ms = int((time.perf_counter() - _rerank_start) * 1000)
    except Exception as _rerank_exc:
        logger.warning("[PIPELINE] reranker skipped: %s", _rerank_exc)

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
    question_type_flags = {
        "isStructuredQuestion": policy_flags.get("isStructuredQuestion", False),
        "isOverviewQuestion":   policy_flags.get("isOverviewQuestion", False),
        "isContactQuestion":    policy_flags.get("isContactQuestion", False),
    }
    uncovered_slots: list[str] = policy_flags.get("uncoveredSlots") or []

    citations = assemble_citations(
        candidates=prompt_candidates,
        citation_display_mode=answer_settings.answer_format.citation_display_mode,
    )
    # 연락처 질문은 전화번호 정규식 추출이 LLM보다 일관되므로 선처리
    direct_contact_answer = _extract_contact_answer_from_candidates(
        question=body.question,
        candidates=prompt_candidates,
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

    policy_detected_intent = (
        policy_flags.get("detectedIntent") if isinstance(policy_flags.get("detectedIntent"), str) else None
    )
    if detected_intent is None:
        detected_intent = policy_detected_intent
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
        and decision != "restricted"
    )

    if abusive_detected:
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
        if detected_intent == "goodbye":
            answer_text = GOODBYE_RESPONSE
        elif detected_intent in NATURAL_INTENT_RESPONSES:
            answer_text = NATURAL_INTENT_RESPONSES[detected_intent]
        else:
            answer_text = SMALL_TALK_FIRST_RESPONSE if user_turn_count <= 0 else SMALL_TALK_REDIRECT_RESPONSE
    elif direct_contact_answer:
        # 연락처는 전화번호 파싱이 더 정확 — LLM 생략
        outcome = "answered"
        answer_text = direct_contact_answer
    elif (decision == "allow" and has_candidates) or can_try_grounded_answer:
        chatbot_name = str(chatbot.name or "")
        institution_name = str(
            getattr(organization, "name", None)
            or getattr(organization, "contact_name", None)
            or ""
        )
        _t0 = time.perf_counter()
        generation = _run_grounded_generation(
            db,
            body=body,
            chatbot=chatbot,
            normalized_query=normalized_query,
            retrieval_output=retrieval_output,
            answer_settings=answer_settings,
            guardrail_eval=guardrail_eval,
            chatbot_name=chatbot_name,
            institution_name=institution_name,
            recent_messages=recent_messages,
            question_type_flags=question_type_flags,
            uncovered_slots=uncovered_slots,
            session_entities=session_entities,
            api_context=api_context,
        )
        _perf_llm_ms = int((time.perf_counter() - _t0) * 1000)
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

        if generation.get("text"):
            answer_text = str(generation["text"])
            if guardrail_eval.get("requiresWarningNotice"):
                warnings.append("최신 기준이나 공고 조건에 따라 결과가 달라질 수 있으므로 담당 부서 확인이 필요합니다.")
            outcome = "answered"
        elif llm_error_code:
            # LLM 오류 시 폴백
            extractive_answer = _build_extractive_overview_answer(
                question=body.question,
                candidates=prompt_candidates,
                chatbot_name=chatbot_name,
                institution_name=institution_name,
            )
            if extractive_answer:
                outcome = "answered"
                answer_text = extractive_answer
                warnings.append("LLM_GENERATION_FAILED_EXTRACTIVE_OVERVIEW_USED")
            else:
                fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
                outcome = fallback["outcome"] if fallback["outcome"] != "answered" else "escalate"
                answer_text = fallback["text"]
                warnings = fallback.get("warnings", [])
                warnings.append("자동 응답 처리 중 오류가 있어 안내 문구로 전환했습니다.")
        else:
            # LLM이 응답 없이 종료 (빈 텍스트)
            extractive_answer = _build_extractive_overview_answer(
                question=body.question,
                candidates=prompt_candidates,
                chatbot_name=chatbot_name,
                institution_name=institution_name,
            )
            if extractive_answer:
                outcome = "answered"
                answer_text = extractive_answer
                warnings.append("EMPTY_MODEL_OUTPUT_EXTRACTIVE_OVERVIEW_USED")
            else:
                fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
                outcome = fallback["outcome"] if fallback["outcome"] != "answered" else "escalate"
                answer_text = fallback["text"]
                warnings = fallback.get("warnings", [])
    elif not has_candidates and not policy_flags.get("unrelatedQuestion") and user_turn_count < 2:
        # 첫 2턴 내 근거 없음 → 질문 구체화 유도
        outcome = "answered"
        answer_text = _build_soft_guidance_response(
            user_turn_count=user_turn_count,
            answer_settings=answer_settings,
        )
    else:
        fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
        outcome = fallback["outcome"]
        answer_text = fallback["text"]
        warnings = fallback.get("warnings", [])

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
    assistant_message_metadata: dict[str, Any] = {
        "conversationTone": {
            "abusiveDetected": abusive_detected,
            "abusiveSeverity": tone_summary.get("abusiveSeverity"),
            "repeatedUserDissatisfaction": bool(policy_flags.get("repeatedUserDissatisfaction")),
            "gratitudeDetected": gratitude_detected,
            "smallTalkDetected": small_talk_detected,
        }
    }
    # 근거 신뢰성(감사)용: 실제 사용된 프롬프트 저장 → 관리자 대화상세에서 열람
    if prompt_bundle:
        assistant_message_metadata["promptTrace"] = {
            "systemPrompt": prompt_bundle.get("systemPrompt"),
            "userPrompt": prompt_bundle.get("userPrompt"),
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

    # 엔티티 추출 및 세션 누적 저장 (비동기적 실패는 조용히 무시)
    if session is not None and answer_text and outcome == "answered":
        try:
            new_entities = extract_entities_from_turn(
                question=body.question,
                answer=answer_text,
            )
            merged = merge_context_entities(session.context_entities, new_entities)
            session.context_entities = merged
            db.commit()
        except Exception:
            db.rollback()

    # 챗봇 theme에서 추천 질문 풀 + followUpEnabled 추출
    _chatbot_theme = dict(chatbot.theme or {}) if chatbot.theme else {}
    _question_pool: list[str] = [
        q for q in (_chatbot_theme.get("recommendedQuestionsPool") or [])
        if isinstance(q, str) and q.strip()
    ]
    _follow_up_enabled: bool = _chatbot_theme.get("followUpEnabled", True) is not False

    follow_up_questions = _build_follow_up_questions(
        body.question,
        answer_text,
        outcome,
        prompt_candidates,
        db,
        natural_conversation=natural_conversation,
        question_pool=_question_pool or None,
        follow_up_enabled=_follow_up_enabled,
    )
    follow_up_source = (
        "llm_dynamic" if (follow_up_questions and _USE_DYNAMIC_FOLLOWUP)
        else ("rule_based" if follow_up_questions else None)
    )

    # ── 조건별 CTA 액션 매칭 (Sprint 3-A) ────────────────────────────────────
    conditional_actions: list[dict[str, Any]] = []
    if outcome == "answered" and answer_text:
        try:
            from app.services.chat.conditional_response_service import match_conditional_responses  # noqa: PLC0415
            conditional_actions = match_conditional_responses(
                question=body.question,
                answer_text=answer_text,
                chatbot_id=str(chatbot.id),
                db=db,
            )
        except Exception as _cta_exc:
            logger.warning("[CONDITIONAL] 매칭 실패: %s", _cta_exc)

    # ── Tools API 구조화 응답 (Sprint 3-F / 3-D) ─────────────────────────────
    # API 연동(view/list)이 구조화 응답을 만들면 그것을 우선 사용.
    # 없으면 response_format_rules 기반 LLM 출력 변환 시도.
    # structured_response=None 이면 기존 answer.text 동작 100% 유지.
    structured_response: TextResponse | ViewResponse | ListResponse | None = api_structured_response
    if structured_response is None and outcome == "answered" and answer_text:
        try:
            from app.services.chat.response_formatter_service import build_structured_response  # noqa: PLC0415
            structured_response = build_structured_response(
                question=body.question,
                answer_text=answer_text,
                candidates=prompt_candidates,
                chatbot_id=str(chatbot.id),
                db=db,
            )
        except Exception as _fmt_exc:
            logger.warning("[RESPONSE_FORMAT] 변환 skipped: %s", _fmt_exc)

    public_trace = _build_public_runtime_trace(
        normalized_query=normalized_query,
        llm_executed=llm_executed,
        llm_error_code=llm_error_code,
        stream_mode=stream_mode,
        user_message_id=str(user_message.id),
        assistant_message_id=str(assistant_message.id),
        session_id=str(session.id),
        session_token=session_token,
        detected_intent=detected_intent,
        intent_routing_method=intent_routing_method,
        intent_confidence=intent_confidence,
        classifier_reason=classifier_reason,
        simple_response_applied=natural_conversation,
        follow_up_questions=follow_up_questions,
        follow_up_source=follow_up_source,
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
        public_trace["detectedIntent"] = detected_intent
        public_trace["intentRoutingMethod"] = intent_routing_method
        public_trace["intentConfidence"] = intent_confidence
        public_trace["classifierReason"] = classifier_reason
        public_trace["classifierUsage"] = classifier_usage
        public_trace["simpleResponseApplied"] = natural_conversation
        public_trace["followUpQuestions"] = follow_up_questions
        public_trace["followUpSource"] = follow_up_source

    # ── 미답변 질문 트래킹 (Sprint 2-C) ─────────────────────────────────────
    # 조건 1: outcome == "escalate"
    # 조건 2: outcome == "answered" 이지만 RAG 최고 점수 < 0.3 (낮은 신뢰도)
    # 조건 3: prompt_candidates 가 비어있음 (근거 없음)
    _top_score: float | None = max(
        (_safe_score(item.get("combinedScore")) or 0.0
         for item in retrieval_output.get("candidates") or []),
        default=None,
    )
    _is_low_confidence = (
        outcome == "answered"
        and _top_score is not None
        and _top_score < 0.3
        and not natural_conversation
    )
    _needs_unanswered_log = (
        outcome == "escalate"                      # 조건 1
        or _is_low_confidence                      # 조건 2
        or (not prompt_candidates and not natural_conversation)  # 조건 3
    )
    if _needs_unanswered_log:
        _log_unanswered(
            chatbot_id=str(chatbot.id),
            organization_id=str(chatbot.organization_id),
            question=body.question,
            search_score=_top_score,
            outcome=outcome,
            session_id=str(session.id) if session is not None else session_token,
        )

    # ── 성능 지표 + 상세 청크 (debug_mode=True 시만 포함, Sprint 3-E) ──────────
    _total_ms = int((time.perf_counter() - total_start) * 1000)
    _performance = PerformanceMetrics(
        intent_classify_ms=_perf_intent_ms,
        query_rewrite_ms=_perf_rewrite_ms,
        retrieval_ms=_perf_retrieval_ms,
        rerank_ms=_perf_rerank_ms,
        api_fetch_ms=_perf_api_ms,
        llm_ms=_perf_llm_ms,
        total_ms=_total_ms,
    ) if include_debug_trace else PerformanceMetrics()

    _detailed_chunks: list[ChunkDetail] = []
    if include_debug_trace and prompt_candidates:
        for _c in prompt_candidates[:10]:
            _signals = _c.get("contentSignals") or {}
            _preview = str(_signals.get("textPreview") or "")[:150]
            _detailed_chunks.append(ChunkDetail(
                chunk_id=str(_c.get("chunkId") or _c.get("documentId") or ""),
                document_name=str(_c.get("documentName") or ""),
                section_title=_c.get("sectionTitle"),
                score=float(_c.get("combinedScore") or 0.0),
                text_preview=_preview,
                chunk_type=None,
                source_url=_c.get("sourceUrl"),
                reranked=bool(_c.get("_reranked", False)),
                used_in_prompt=bool(_c.get("usedInPrompt", True)),
            ))

    langfuse_service.end_chat_trace(outcome=outcome, answer_text=answer_text)

    # ── 시맨틱 답변 캐시 저장 (USE_ANSWER_CACHE=true + 조건 통과 시) ─────────
    # 1턴 + outcome=answered 만 저장. citations/follow_ups 도 함께 직렬화.
    try:
        _store_skip, _ = _answer_cache.should_skip(
            recent_messages=recent_messages,
            outcome=outcome,
            requires_cautious_wording=bool(guardrail_eval.get("requiresCautiousWording")) if isinstance(guardrail_eval, dict) else False,
        )
        if not _store_skip:
            _answer_cache.store(
                str(chatbot.id),
                body.question,
                answer_text=answer_text,
                outcome=outcome,
                citations=[c.model_dump(by_alias=True) for c in citations] if citations else [],
                follow_up_questions=list(follow_up_questions or []),
                structured_response=(
                    structured_response.model_dump(by_alias=True) if structured_response is not None else None
                ),
            )
    except Exception as _cache_exc:  # noqa: BLE001
        logger.warning("[ANSWER_CACHE_STORE_SKIPPED] error=%s", _cache_exc)

    return ChatRuntimeResponse(
        request_id=request_id,
        chatbot_id=str(chatbot.id),
        outcome=outcome,
        answer={"text": answer_text, "warnings": warnings},
        citations=citations,
        follow_up_questions=follow_up_questions,
        policy_decision=policy_decision if include_debug_trace else {},
        trace=public_trace,
        conditional_actions=conditional_actions,
        performance=_performance,
        detailed_chunks=_detailed_chunks,
        structured_response=structured_response,
    )

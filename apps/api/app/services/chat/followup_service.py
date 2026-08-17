"""추천 질문(follow-up) 생성.

두 가지 원칙으로 만든다.

**맥락** — 직전 대화 몇 턴을 함께 본다. 매 턴 독립적으로 추천하면 "신청
자격"을 묻던 사람에게 갑자기 기관 소개를 권하게 된다.

**근거** — 생성한 질문이 등록 자료로 답할 수 있는지 실제 검색으로 확인하고,
답 못 할 질문은 버린다. 이용자가 추천 버튼을 눌렀는데 "근거를 찾지
못했습니다"가 뜨면 추천이 없느니만 못하다. 생성 프롬프트에 자료를 넣어
제약하는 것만으로는 부족하다 — LLM은 결국 지어낸다. 검색을 한 번 더
돌리는 게 확실한 방법이다.

검증을 통과한 질문이 없으면 빈 목록을 반환한다. 답 못 할 질문을 보여주느니
버튼을 감추는 편이 낫다.

관리자가 직접 등록한 추천 질문 풀은 검증하지 않는다. 사람이 보고 넣은
것이고 화면에서 언제든 고칠 수 있다 — 자동 생성물과 신뢰도가 다르다.
"""

from __future__ import annotations

import json
import logging
import re
from difflib import SequenceMatcher
from typing import Any

logger = logging.getLogger(__name__)

_MAX_FOLLOW_UPS = 3

# 검증 임계값. 실제 답변 파이프라인의 문서 임계값(0.32)보다 낮게 잡는다.
# 추천 질문은 "답이 나올 가능성"만 보면 되고, 너무 빡세게 걸면 자료가
# 넉넉한 기관에서도 추천이 통째로 사라진다.
_VERIFY_MIN_SIMILARITY = 0.28

# 프롬프트에 넣을 근거 청크 수와 길이. 늘릴수록 추천 품질은 오르지만
# 속도 우선 모델의 입력이 커진다.
_GROUNDING_CHUNKS = 5
_GROUNDING_CHARS = 400

_HISTORY_TURNS = 3


def _norm_key(value: str) -> str:
    """중복 판정용 정규화 — 공백·물음표·마침표를 지운다."""
    return re.sub(r"[\s?？!.。]+", "", value.strip())


def _dedupe(items: list[str], *, exclude: str | None = None) -> list[str]:
    result: list[str] = []
    exclude_key = _norm_key(exclude) if exclude else None
    for item in items:
        normalized = " ".join(item.split())
        if not normalized:
            continue
        if normalized in result:
            continue
        if exclude_key and _norm_key(normalized) == exclude_key:
            continue
        result.append(normalized)
        if len(result) == _MAX_FOLLOW_UPS:
            break
    return result


def _history_text(recent_messages: list[Any]) -> str:
    """최근 대화를 '역할: 내용' 몇 줄로 압축한다.

    recent_messages 는 최신이 뒤에 오는 순서로 들어온다. 마지막 사용자
    질문은 별도로 프롬프트에 들어가므로 여기서는 그 이전 맥락만 쓴다.
    """
    if not recent_messages:
        return ""

    lines: list[str] = []
    for message in recent_messages[-(_HISTORY_TURNS * 2) :]:
        role = getattr(message, "role", None) or (
            message.get("role") if isinstance(message, dict) else None
        )
        content = getattr(message, "content", None) or (
            message.get("content") if isinstance(message, dict) else None
        )
        if not role or not content:
            continue
        speaker = "사용자" if role == "user" else "챗봇"
        lines.append(f"{speaker}: {str(content)[:150]}")

    return "\n".join(lines[-(_HISTORY_TURNS * 2) :])


def _grounding_text(candidates: list[dict[str, Any]]) -> str:
    """검색된 근거 청크를 프롬프트용 텍스트로 만든다.

    본문은 candidate["contentSignals"]["textPreview"] 에 있다. 최상위에
    textContent 같은 키는 없다 — retrieval_precheck_service 가 조립하는
    형태를 그대로 따른다.
    """
    parts: list[str] = []
    for index, candidate in enumerate(candidates[:_GROUNDING_CHUNKS], start=1):
        signals = candidate.get("contentSignals")
        if not isinstance(signals, dict):
            continue
        text = str(signals.get("textPreview") or signals.get("contextText") or "").strip()
        if not text:
            continue
        section = str(signals.get("sectionTitle") or "").strip()
        header = f"[자료{index}" + (f" · {section}]" if section else "]")
        parts.append(f"{header} {text[:_GROUNDING_CHARS]}")
    return "\n\n".join(parts)


_NON_WORD_RE = re.compile(r"[^0-9A-Za-z가-힣]+")

# 어느 사업에나 붙는 절차 명사들. 이것만으로 이루어진 질문은 대상이 없다.
# "신청 방법은 어떻게 되나요?" 가 융자 대화 중에 추천됐는데 누르니 환경조사
# 신청방법이 나왔다 — 질문이 독립 실행되면서 대화 맥락이 사라지기 때문이다.
_GENERIC_TERMS = (
    "신청",
    "방법",
    "절차",
    "서류",
    "제출",
    "기간",
    "일정",
    "조건",
    "자격",
    "요건",
    "문의",
    "연락",
    "담당",
    "부서",
    "지원",
    "대상",
    "안내",
    "확인",
    "접수",
    "마감",
    "비용",
    "금액",
    "기준",
    "내용",
    "정보",
    "자료",
    "규정",
    "지침",
    "공고",
    "등록",
    "어떻게",
    "무엇",
    "언제",
    "어디",
    "얼마",
    "누구",
    "가능",
    "필요",
    "준비",
    # 의문문 어미. 조사·어미가 붙어도 걸리도록 접두 비교를 쓴다.
    "되나요",
    "인가요",
    "있나요",
    "하나요",
    "됩니",
    "입니",
    "합니",
    "되는지",
    "하는지",
)

_EVIDENCE_MIN_LEN = 8
# 인용문에서 자료와 연속으로 일치해야 하는 최소 길이. 모델이 중간을 생략해
# 인용하는 건 흔하므로 전체 일치율 대신 '가장 긴 연속 일치'를 본다.
_EVIDENCE_MIN_RUN = 12


def _normalize_for_match(text: str) -> str:
    """공백·문장부호를 지운 비교용 문자열."""
    return _NON_WORD_RE.sub("", text)


def _evidence_supported(evidence: str, grounding: str) -> bool:
    """모델이 인용한 문장이 실제 자료에 있는지 확인한다.

    LLM은 근거를 요구하면 없는 문장을 지어낸다. 인용문과 자료의 '가장 긴 연속
    일치' 길이를 본다. 중간을 생략해 인용하는 건 흔하므로 전체 일치율로 보면
    정상 인용이 탈락한다. 반대로 통째로 창작한 문장은 긴 연속 일치가 나오지
    않아 걸러진다.
    """
    normalized_evidence = _normalize_for_match(evidence)
    normalized_grounding = _normalize_for_match(grounding)
    if len(normalized_evidence) < _EVIDENCE_MIN_LEN or not normalized_grounding:
        return False

    matcher = SequenceMatcher(None, normalized_evidence, normalized_grounding, autojunk=False)
    longest = matcher.find_longest_match(
        0, len(normalized_evidence), 0, len(normalized_grounding)
    ).size
    required = min(_EVIDENCE_MIN_RUN, len(normalized_evidence) // 2)
    return longest >= required


def _is_generic_token(token: str) -> bool:
    """절차 명사인지 판정. 한국어는 조사·어미가 붙으므로 접두로 본다.

    '서류는', '방법은', '무엇인가요' 처럼 붙어 나오는 형태를 정확히 일치로
    걸러내려다 통과시켰다 — 그래서 대상 없는 질문이 살아남았다.
    """
    return any(token.startswith(term) for term in _GENERIC_TERMS)


def _has_subject(candidate: str, context: str) -> bool:
    """질문이 무엇에 대한 것인지 문장만 보고 알 수 있는지 확인한다.

    절차 명사(신청·방법·서류…)만으로 된 질문은 클릭하는 순간 대화 맥락을
    잃고 엉뚱한 사업의 자료로 답하게 된다. 대화에 등장한 고유한 낱말이
    질문 안에 하나라도 들어 있어야 한다.
    """
    tokens = {
        token
        for token in _NON_WORD_RE.split(candidate)
        if len(token) >= 2 and not _is_generic_token(token)
    }
    if not tokens:
        return False
    normalized_context = _normalize_for_match(context)
    return any(token in normalized_context for token in tokens)


def _generate_with_llm(
    *,
    question: str,
    answer_text: str,
    history: str,
    grounding: str,
    db: Any,
) -> list[tuple[str, str]]:
    """대화 맥락 + 근거 자료를 주고 (질문, 인용문) 쌍을 만든다. 실패 시 []."""
    from app.services.chat.answer_generation_service import (  # noqa: PLC0415
        _call_anthropic,
        _call_openai_like,
        _extract_output_text_anthropic,
        _extract_output_text_openai,
    )
    from app.services.llm_api_config_runtime_service import (  # noqa: PLC0415
        resolve_runtime_api_config as _resolve,
    )

    try:
        runtime_api = _resolve(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[FOLLOWUP] runtime api 조회 실패: %s", exc)
        return []
    if runtime_api is None:
        return []

    system_prompt = (
        "이어질 질문을 만드는 도우미입니다. 자료에 답이 실제로 적혀 있는 질문만 만듭니다. "
        "JSON 배열만 출력하고 설명은 붙이지 않습니다."
    )

    sections = []
    if history:
        sections.append(f"[이전 대화]\n{history}")
    sections.append(f"[현재 질문]\n{question}")
    sections.append(f"[현재 답변]\n{answer_text[:600]}")
    if grounding:
        sections.append(f"[답변에 쓰인 등록 자료]\n{grounding}")

    user_prompt = (
        "\n\n".join(sections) + "\n\n"
        "위 대화에 이어질 질문을 최대 3개 만들어 주세요.\n"
        "각 질문마다 그 답이 적힌 원문 문장을 evidence 로 그대로 옮겨 적어야 합니다.\n\n"
        "규칙:\n"
        "1. 질문에 대상을 반드시 넣을 것. 무엇에 대한 질문인지 문장만 보고 알 수 있어야 합니다.\n"
        '   나쁨: "신청 방법은 어떻게 되나요?"  ← 무엇의 신청인지 알 수 없음\n'
        '   좋음: "융자지원 신청 방법은 어떻게 되나요?"\n'
        "2. evidence 는 자료에 있는 문장을 그대로 옮길 것. 요약하거나 지어내지 마세요.\n"
        "3. evidence 에 답이 실제로 적혀 있어야 합니다. 주제만 언급된 문장은 근거가 아닙니다.\n"
        '   예: "제출 서류의 유효기간에 유의해 주세요" 는 유효기간이 며칠인지 말하지 않으므로\n'
        '   "서류 유효기간은?" 의 근거가 될 수 없습니다.\n'
        "4. 이미 나온 질문과 중복 금지. 질문은 30자 이내 한국어 의문문.\n"
        "5. 조건을 만족하는 질문이 없으면 빈 배열을 출력하세요. 개수를 채우려 하지 마세요.\n\n"
        "응답 형식:\n"
        '[{"q": "융자 신청 자격은 어떻게 되나요?", "evidence": "농림축산식품부장관에게 '
        '사업계획을 신고한 자"}]'
    )

    model = runtime_api.speed_model()  # 추천 질문은 속도 우선

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
    except Exception as exc:  # noqa: BLE001
        logger.warning("[FOLLOWUP] LLM 호출 실패: %s", exc)
        return []

    match = re.search(r"\[.*\]", (raw_text or "").strip(), re.DOTALL)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(parsed, list):
        return []

    result: list[tuple[str, str]] = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("q") or "").strip()
        evidence = str(entry.get("evidence") or "").strip()
        if text:
            result.append((text, evidence))
    return result


def verify_against_knowledge(
    questions: list[str],
    *,
    db: Any,
    organization_id: str,
    chatbot_id: str,
) -> list[str]:
    """등록 자료로 답할 수 있는 질문만 남긴다.

    질문 3개를 한 번에 임베딩(배치 1회 호출, 7일 캐시)하고 각각 벡터 검색을
    돌려 최고 유사도가 임계값을 넘는 것만 통과시킨다.

    임베딩이나 검색이 실패하면 **원본을 그대로 통과시킨다.** 검증은 품질을
    올리려는 장치지 답변을 막는 장치가 아니다. OpenAI 장애로 추천이 통째로
    사라지는 건 과한 대가다.
    """
    if not questions:
        return []

    from app.models import DocumentChunk  # noqa: PLC0415
    from app.repositories.admin.search_control_repository import _build_base_stmt  # noqa: PLC0415
    from app.services.embedding_service import generate_embeddings_batch  # noqa: PLC0415

    try:
        embeddings = generate_embeddings_batch(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            texts=questions,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[FOLLOWUP_VERIFY] 임베딩 실패 — 검증 생략: %s", exc)
        return questions

    base_stmt = _build_base_stmt(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        corpus_domains=None,
        source_types=None,
        include_inactive=False,
    ).where(DocumentChunk.embedding.is_not(None))

    verified: list[str] = []
    for question, embedding in zip(questions, embeddings, strict=False):
        if embedding is None:
            # 이 질문만 임베딩 실패 — 판단할 수 없으니 통과시킨다.
            verified.append(question)
            continue
        try:
            distance = db.execute(
                base_stmt.order_by(DocumentChunk.embedding.cosine_distance(embedding))
                .limit(1)
                .with_only_columns(DocumentChunk.embedding.cosine_distance(embedding))
            ).scalar()
        except Exception as exc:  # noqa: BLE001
            logger.warning("[FOLLOWUP_VERIFY] 검색 실패 — 검증 생략: %s", exc)
            return questions

        if distance is None:
            # 등록된 청크가 하나도 없다 — 추천할 근거 자체가 없다.
            continue
        similarity = 1.0 - float(distance)
        if similarity >= _VERIFY_MIN_SIMILARITY:
            verified.append(question)
        else:
            logger.info(
                "[FOLLOWUP_VERIFY] dropped similarity=%.3f question=%s",
                similarity,
                question[:40],
            )

    return verified


def select_from_pool(
    *,
    question: str,
    answer_text: str,
    pool: list[str],
    db: Any,
    use_llm: bool,
) -> list[str]:
    """관리자가 등록한 풀에서 현재 대화와 가장 관련 있는 3개를 고른다."""
    if not pool:
        return []
    if use_llm and db is not None:
        selected = _llm_select_from_pool(question, answer_text, pool, db)
        if selected:
            return selected
    return _keyword_select_from_pool(question, answer_text, pool)


_KO_STOPWORDS = {
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "에서",
    "으로",
    "로",
    "와",
    "과",
    "도",
    "만",
    "이다",
    "입니다",
    "했",
    "하는",
    "있는",
    "없는",
    "하면",
    "있으면",
    "어떻게",
    "무엇",
    "언제",
    "어디",
    "왜",
    "누구",
}


def _keyword_select_from_pool(question: str, answer_text: str, pool: list[str]) -> list[str]:
    """키워드 오버랩 상위 3개. 오버랩이 없으면 풀 순서대로 보완."""
    context_words = set((question + " " + answer_text).lower().split()) - _KO_STOPWORDS

    scored: list[tuple[int, str]] = []
    for candidate in pool:
        candidate_words = set(candidate.lower().split()) - _KO_STOPWORDS
        scored.append((len(context_words & candidate_words), candidate))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    result = [q for score, q in scored if score > 0][:_MAX_FOLLOW_UPS]
    if len(result) < _MAX_FOLLOW_UPS:
        result += [q for score, q in scored if score == 0][: _MAX_FOLLOW_UPS - len(result)]
    return result[:_MAX_FOLLOW_UPS]


def _llm_select_from_pool(
    question: str,
    answer_text: str,
    pool: list[str],
    db: Any,
) -> list[str]:
    """풀 목록과 현재 대화를 주고 번호로 3개 고르게 한다. 실패 시 []."""
    from app.services.chat.answer_generation_service import (  # noqa: PLC0415
        _call_anthropic,
        _call_openai_like,
        _extract_output_text_anthropic,
        _extract_output_text_openai,
    )
    from app.services.llm_api_config_runtime_service import (  # noqa: PLC0415
        resolve_runtime_api_config as _resolve,
    )

    try:
        runtime_api = _resolve(db)
    except Exception:  # noqa: BLE001
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

    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=runtime_api.speed_model(),
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
                model=runtime_api.speed_model(),
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

        match = re.search(r"\[[\d,\s]+\]", raw or "")
        if not match:
            return []
        indices = json.loads(match.group(0))
        return [pool[i - 1] for i in indices if isinstance(i, int) and 1 <= i <= len(pool)][
            :_MAX_FOLLOW_UPS
        ]
    except Exception:  # noqa: BLE001
        return []


def build_follow_up_questions(
    *,
    question: str,
    answer_text: str,
    outcome: str,
    candidates: list[dict[str, Any]],
    db: Any,
    organization_id: str,
    chatbot_id: str,
    recent_messages: list[Any] | None = None,
    natural_conversation: bool = False,
    privacy_blocked: bool = False,
    question_pool: list[str] | None = None,
    follow_up_enabled: bool = True,
    use_llm: bool = True,
) -> tuple[list[str], str | None]:
    """추천 질문 목록과 그 출처를 돌려준다.

    반환: (질문 목록, 출처)
    출처는 "admin_pool" | "llm_verified" | None.
    """
    if natural_conversation or privacy_blocked or not follow_up_enabled:
        return [], None

    # 답변하지 못한 턴에는 추천하지 않는다. 근거를 못 찾은 상태에서 추천을
    # 붙이면 "이건 답 못 하지만 저건 물어보세요" 가 되어 더 답답하다.
    if outcome != "answered":
        return [], None

    # ── 관리자 등록 풀이 있으면 그것을 쓴다 ─────────────────────────────────
    # 사람이 보고 넣은 질문이라 자동 생성물과 신뢰도가 다르다. 검증하지 않는다.
    if question_pool:
        selected = select_from_pool(
            question=question,
            answer_text=answer_text,
            pool=question_pool,
            db=db,
            use_llm=use_llm,
        )
        if selected:
            return _dedupe(selected, exclude=question), "admin_pool"

    if not use_llm or db is None:
        return [], None

    history = _history_text(recent_messages or [])
    chunk_text = _grounding_text(candidates)

    # 인용문 대조 대상. 답변 본문도 포함한다 — FAQ 경로는 RAG 후보가 없고,
    # 답변 자체가 등록 자료에서 나온 문장이라 근거로 인정할 수 있다.
    grounding = "\n\n".join(part for part in (chunk_text, answer_text) if part)

    # 대상 판정 기준. 이번 대화에 등장한 낱말이어야 "맥락 안"이다.
    subject_context = " ".join(
        part for part in (history, question, answer_text, chunk_text) if part
    )

    generated = _generate_with_llm(
        question=question,
        answer_text=answer_text,
        history=history,
        grounding=chunk_text,
        db=db,
    )
    if not generated:
        return [], None

    kept: list[str] = []
    dropped_no_subject = 0
    dropped_no_evidence = 0
    for text, evidence in generated:
        if not _has_subject(text, subject_context):
            dropped_no_subject += 1
            continue
        if not _evidence_supported(evidence, grounding):
            dropped_no_evidence += 1
            continue
        kept.append(text)

    deduped = _dedupe(kept, exclude=question)
    verified = verify_against_knowledge(
        deduped,
        db=db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )

    logger.info(
        "[FOLLOWUP] generated=%d no_subject=%d no_evidence=%d verified=%d chatbot_id=%s",
        len(generated),
        dropped_no_subject,
        dropped_no_evidence,
        len(verified),
        chatbot_id,
    )

    if not verified:
        return [], None
    return verified[:_MAX_FOLLOW_UPS], "llm_verified"

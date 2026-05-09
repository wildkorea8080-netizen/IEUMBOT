from typing import Any

from app.schemas.answer_settings import AnswerSettings
from app.services.chat.entity_extraction_service import format_entities_for_prompt


def _build_section_instruction(settings: AnswerSettings) -> str:
    if settings.answer_format.answer_template_mode == "fixed_public_service":
        return (
            "답변은 질문 성격에 맞게 구성하세요. 일반 안내는 '핵심 안내 -> 구체 내용 -> 확인/신청 방법 -> 필요한 경우 도움 경로' 순서를 우선합니다. "
            "정확한 일정, 모집 기간, 자격요건처럼 변동 가능성이 큰 내용은 공식 공지 확인 필요성을 짧게 덧붙이세요."
        )

    sections: list[str] = []
    if settings.answer_format.include_conclusion_section:
        sections.append("핵심 안내")
    if settings.answer_format.include_reason_section:
        sections.append("근거")
    if settings.answer_format.include_detailed_guidance_section:
        sections.append("구체 내용")
    if settings.answer_format.include_caution_section:
        sections.append("확인 사항")
    if settings.answer_policy.require_citations:
        sections.append("출처")
    if not sections:
        sections.append("요약")
    return "답변 구성: " + ", ".join(sections)


def _build_policy_instruction(settings: AnswerSettings) -> list[str]:
    lines = [
        "너는 기관의 AI 상담 챗봇이다.",
        "등록된 정책문서, 운영가이드, FAQ, 웹사이트 색인 결과를 우선 근거로 사용한다.",
        "근거가 있는 경우 명확하고 친절하게 답한다.",
        "근거가 부족하면 추측하지 않는다.",
        "단순 인사에는 자연스럽게 응답한다.",
        "질문이 모호하면 바로 이관하지 말고 먼저 추가 정보를 요청한다.",
        "담당 부서 연결은 최후 수단으로만 안내한다.",
        "가능하면 참고한 문서명이나 웹페이지명을 함께 안내한다.",
        "한국어로 답변한다.",
        "이용자의 요청을 먼저 짧게 받아주고, 바로 필요한 정보를 구체적으로 안내하세요.",
        "답변 첫 문장은 '네, 요청하신 내용을 안내해 드릴게요.'처럼 부드러운 확인 문장으로 시작하세요.",
        "근거 문서에 있는 내용만 사실로 말하고, 근거에 없는 세부 일정/자격/신청 링크는 만들어내지 마세요.",
        "근거가 일부만 있으면 확인 가능한 범위와 추가 확인이 필요한 범위를 분리해 말하세요.",
        "답변 끝에는 '원하시면 신청 방법도 이어서 안내해 드릴까요?'처럼 사용자가 다음으로 물어볼 만한 한 가지 선택지를 자연스럽게 제안하세요.",
    ]
    if settings.answer_policy.require_citations:
        lines.append("주요 사실 뒤에는 [S1], [S2] 형식으로 출처를 표시하세요.")
    if settings.answer_policy.disallow_definitive_claims:
        lines.append("'무조건', '반드시', '100%' 같은 단정 표현은 피하고, 조건과 예외를 함께 안내하세요.")
    if settings.answer_policy.disallow_outcome_prediction:
        lines.append("선정, 합격, 승인 가능성을 예측하지 말고 공식 기준과 절차만 안내하세요.")
    if settings.answer_policy.disallow_legal_judgment:
        lines.append("법률 판단이나 유권해석은 하지 말고 담당 기관 확인을 권하세요.")
    if settings.answer_policy.require_latest_source_check_warning_when_relevant:
        lines.append("일정, 신청 기간, 모집 여부처럼 변동되는 정보는 공식 홈페이지/공지 확인 필요성을 안내하세요.")
    if settings.escalation_operating.enable_escalation_suggestion:
        lines.append("근거가 부족하거나 개인별 판단이 필요한 경우에만 담당 기관 문의 또는 상담 연결을 제안하세요.")
    return lines


def _build_style_instruction(settings: AnswerSettings) -> list[str]:
    return [
        f"역할 모드: {settings.prompt_instruction.assistant_role_mode}",
        f"톤 모드: {settings.prompt_instruction.tone_mode}",
        f"답변 스타일: {settings.prompt_instruction.answer_style_mode}",
        f"답변 길이: {settings.answer_format.max_answer_length_mode}",
        "문장은 부드럽고 존중하는 한국어로 작성하되, 과장된 위로나 확정적 약속은 피하세요.",
        "목록은 3~6개 정도로 정리하고, 각 항목은 한두 문장으로 구체화하세요.",
    ]


def _build_history_block(recent_messages: list[Any] | None) -> str:
    """최근 대화를 시간순(오름차순) user/assistant 쌍으로 조립. 없으면 빈 문자열."""
    if not recent_messages:
        return ""

    def _field(msg: Any, key: str) -> str:
        if isinstance(msg, dict):
            return str(msg.get(key) or "")
        return str(getattr(msg, key, "") or "")

    # list_recent_session_messages는 최신순(DESC) 반환 → 오름차순으로 뒤집기
    chronological = list(reversed(recent_messages))

    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(chronological) and len(pairs) < 4:
        role = _field(chronological[i], "role")
        content = _field(chronological[i], "content")
        if role == "user" and i + 1 < len(chronological):
            next_role = _field(chronological[i + 1], "role")
            next_content = _field(chronological[i + 1], "content")
            if next_role == "assistant":
                asst_text = next_content[:200] + "..." if len(next_content) > 200 else next_content
                pairs.append((content, asst_text))
                i += 2
                continue
        i += 1

    if not pairs:
        return ""

    lines = ["[이전 대화]"]
    for user_text, asst_text in pairs:
        lines.append(f"사용자: {user_text}")
        lines.append(f"챗봇: {asst_text}")
    lines.append("———")
    return "\n".join(lines) + "\n\n"


def build_answer_prompt(
    *,
    question: str,
    normalized_query: str,
    candidates: list[dict[str, Any]],
    settings: AnswerSettings,
    requires_cautious_wording: bool,
    requires_warning_notice: bool,
    recent_messages: list[Any] | None = None,
    question_type_flags: dict | None = None,
    uncovered_slots: list[str] | None = None,
    session_entities: dict | None = None,
) -> dict[str, str]:
    source_lines: list[str] = []
    for index, item in enumerate(candidates[:5], start=1):
        text_preview = str(item.get("contentSignals", {}).get("textPreview", "") or "").strip()

        source_type = item.get("sourceType", "")
        source_url  = item.get("sourceUrl") or ""
        page_number = item.get("pageNumber")
        doc_name    = item.get("documentName") or ""
        section     = item.get("sectionTitle") or ""
        score       = item.get("combinedScore", 0)

        # 소스타입별 출처 레이블
        if source_type == "website":
            url_label = source_url.rstrip("/").split("/")[-1] if source_url else "웹페이지"
            origin_line = f"출처: {doc_name} ({url_label})"
            if source_url:
                origin_line += f"\nURL: {source_url}"
        elif source_type == "text":
            origin_line = f"출처: {doc_name} [직접 등록 텍스트]"
        else:  # "file"
            page_str = f"{page_number}p" if page_number else "페이지 미상"
            origin_line = f"출처: {doc_name} — {page_str}"

        # 섹션 라인 (있을 때만)
        section_line = f"섹션: {section}\n" if section else ""

        source_lines.append(
            f"[S{index}] {origin_line}\n"
            f"{section_line}"
            f"관련도: {score:.4f}\n"
            f"근거 본문:\n{text_preview}\n"
        )

    flags = question_type_flags or {}
    type_instruction = ""

    if flags.get("isContactQuestion"):
        type_instruction = (
            "이 질문은 연락처·담당부서 문의입니다.\n"
            "전화번호, 이메일, 담당부서명을 근거에서 찾아 먼저 제시하세요.\n"
            "없으면 '공식 홈페이지에서 확인'을 안내하세요."
        )
    elif flags.get("isStructuredQuestion"):
        type_instruction = (
            "이 질문은 자격·절차·일정 등 구조적 정보 문의입니다.\n"
            "항목별로 구분하여 답변하세요: "
            "① 대상/자격 ② 신청방법/절차 ③ 기간/일정 ④ 유의사항 순으로.\n"
            "근거에 없는 항목은 '확인 필요'로 표시하세요."
        )
    elif flags.get("isOverviewQuestion"):
        type_instruction = (
            "이 질문은 사업·기관 소개 문의입니다.\n"
            "핵심 기능 또는 사업 목적을 먼저 1~2문장으로 요약한 뒤,\n"
            "대상·내용·문의처 순으로 안내하세요."
        )

    # 미확인 슬롯 안내 조립
    slot_label_map = {
        "조건":   "신청 자격·조건",
        "기간":   "신청 기간·일정",
        "대상":   "지원 대상",
        "방법":   "신청 방법·절차",
        "연락처": "문의처·연락처",
    }
    slots = uncovered_slots or []
    # 구조적 질문이고 미확인 슬롯이 있을 때만 안내 추가
    # (일반 질문에서는 불필요한 노이즈가 될 수 있음)
    if slots and flags.get("isStructuredQuestion"):
        slot_labels = [slot_label_map.get(s, s) for s in slots]
        slot_notice = (
            f"근거 문서에서 다음 항목은 확인되지 않았습니다: "
            f"{', '.join(slot_labels)}.\n"
            "해당 항목은 '공식 공고 또는 담당 부서 확인이 필요합니다'라고 명시하세요."
        )
    else:
        slot_notice = ""

    caution_instruction = ""
    if requires_cautious_wording:
        caution_instruction += "표현은 신중하게, 조건부로 작성하세요.\n"
    if requires_warning_notice:
        caution_instruction += "필요하면 최신 기준 확인 안내를 포함하세요.\n"

    system_parts = [
        settings.prompt_instruction.system_prompt.strip() or "너는 기관의 AI 상담 챗봇이다.",
        *_build_policy_instruction(settings),
        *_build_style_instruction(settings),
        _build_section_instruction(settings),
        settings.prompt_instruction.additional_instructions.strip(),
        type_instruction.strip(),
        slot_notice.strip(),
        caution_instruction.strip(),
    ]
    system_prompt = "\n".join([part for part in system_parts if part])

    history_block = _build_history_block(recent_messages)
    entity_block = format_entities_for_prompt(session_entities)

    user_prompt = (
        history_block
        + entity_block
        + f"사용자 질문: {question}\n"
        f"정규화 질문: {normalized_query}\n\n"
        "아래 근거만 사용해 질문에 직접 답하세요.\n"
        "기관 소개나 사업 안내 질문이면 확인되는 사업명, 대상, 제공 내용, 참여/문의 방법을 구체적으로 정리하세요.\n"
        "교육 일정, 자격요건, 신청 기간처럼 근거에 정확한 값이 없으면 임의로 만들지 말고 공식 공지 확인이 필요하다고 말하세요.\n\n"
        + "\n".join(source_lines)
        + "\n출처 표시는 [S번호] 형식을 사용하세요."
    )

    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}

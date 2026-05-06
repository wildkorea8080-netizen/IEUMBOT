from typing import Any

from app.schemas.answer_settings import AnswerSettings


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
        "당신은 공공기관의 상담형 안내 챗봇입니다.",
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
        lines.append("근거가 부족하거나 개인별 판단이 필요한 경우 담당 기관 문의 또는 상담 연결을 제안하세요.")
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


def build_answer_prompt(
    *,
    question: str,
    normalized_query: str,
    candidates: list[dict[str, Any]],
    settings: AnswerSettings,
    requires_cautious_wording: bool,
    requires_warning_notice: bool,
) -> dict[str, str]:
    source_lines: list[str] = []
    for index, item in enumerate(candidates[:5], start=1):
        text_preview = str(item.get("contentSignals", {}).get("textPreview", "") or "").strip()
        source_lines.append(
            f"[S{index}] 제목: {item.get('documentName')}\n"
            f"버전: {item.get('versionLabel')} | 소스: {item.get('sourceType')} | 도메인: {item.get('corpusDomain')}\n"
            f"페이지: {item.get('pageNumber')} | 섹션: {item.get('sectionTitle')}\n"
            f"관련도 점수: {item.get('combinedScore')}\n"
            f"근거 본문:\n{text_preview}\n"
        )

    caution_instruction = ""
    if requires_cautious_wording:
        caution_instruction += "표현은 신중하게, 조건부로 작성하세요.\n"
    if requires_warning_notice:
        caution_instruction += "필요하면 최신 기준 확인 안내를 포함하세요.\n"

    system_parts = [
        settings.prompt_instruction.system_prompt.strip() or "당신은 공공기관 문서 기반 안내 챗봇입니다.",
        *_build_policy_instruction(settings),
        *_build_style_instruction(settings),
        _build_section_instruction(settings),
        settings.prompt_instruction.additional_instructions.strip(),
        caution_instruction.strip(),
    ]
    system_prompt = "\n".join([part for part in system_parts if part])

    user_prompt = (
        f"사용자 질문: {question}\n"
        f"정규화 질문: {normalized_query}\n\n"
        "아래 근거만 사용해 질문에 직접 답하세요.\n"
        "기관 소개나 사업 안내 질문이면 확인되는 사업명, 대상, 제공 내용, 참여/문의 방법을 구체적으로 정리하세요.\n"
        "교육 일정, 자격요건, 신청 기간처럼 근거에 정확한 값이 없으면 임의로 만들지 말고 공식 공지 확인이 필요하다고 말하세요.\n\n"
        + "\n".join(source_lines)
        + "\n출처 표시는 [S번호] 형식을 사용하세요."
    )

    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}

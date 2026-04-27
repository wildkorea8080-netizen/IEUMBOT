from typing import Any

from app.schemas.answer_settings import AnswerSettings


def _build_section_instruction(settings: AnswerSettings) -> str:
    if settings.answer_format.answer_template_mode == "fixed_public_service":
        return (
            "답변은 다음 섹션 순서를 유지하세요: 결론, 이유, 세부 안내, 출처, 유의사항. "
            "각 섹션 제목을 명시하고 한국어로 간결하게 작성하세요."
        )

    sections: list[str] = []
    if settings.answer_format.include_conclusion_section:
        sections.append("결론")
    if settings.answer_format.include_reason_section:
        sections.append("이유")
    if settings.answer_format.include_detailed_guidance_section:
        sections.append("세부 안내")
    if settings.answer_format.include_caution_section:
        sections.append("유의사항")
    if settings.answer_policy.require_citations:
        sections.append("출처")
    if not sections:
        sections.append("요약")
    return "답변 섹션 구성: " + ", ".join(sections)


def _build_policy_instruction(settings: AnswerSettings) -> list[str]:
    lines = [
        "공공기관 안내 챗봇으로서 근거 기반으로만 답변하세요.",
        "근거 문서에 없는 내용은 추정하지 마세요.",
    ]
    if settings.answer_policy.require_citations:
        lines.append("모든 핵심 주장 뒤에 반드시 출처를 표시하세요. 형식: [S1], [S2]")
    if settings.answer_policy.disallow_definitive_claims:
        lines.append("확정형 단정 표현(무조건, 반드시, 100%)을 피하세요.")
    if settings.answer_policy.disallow_outcome_prediction:
        lines.append("심사 결과/선정 여부 예측을 하지 마세요.")
    if settings.answer_policy.disallow_legal_judgment:
        lines.append("법률 판단/법적 해석은 하지 말고 담당 부서 문의를 권장하세요.")
    if settings.answer_policy.require_latest_source_check_warning_when_relevant:
        lines.append("최신성 확인이 필요한 경우 유의사항에 확인 필요 문구를 추가하세요.")
    if settings.escalation_operating.enable_escalation_suggestion:
        lines.append("불확실하면 담당 부서 연결을 권장하세요.")
    return lines


def _build_style_instruction(settings: AnswerSettings) -> list[str]:
    return [
        f"역할 모드: {settings.prompt_instruction.assistant_role_mode}",
        f"톤 모드: {settings.prompt_instruction.tone_mode}",
        f"답변 스타일: {settings.prompt_instruction.answer_style_mode}",
        f"답변 길이 모드: {settings.answer_format.max_answer_length_mode}",
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
        source_lines.append(
            (
                f"[S{index}] 제목: {item.get('documentName')}\n"
                f"버전: {item.get('versionLabel')} | 소스: {item.get('sourceType')} | 코퍼스: {item.get('corpusDomain')}\n"
                f"페이지: {item.get('pageNumber')} | 섹션: {item.get('sectionTitle')}\n"
                f"근거요약: {item.get('contentSignals', {}).get('textPreview', '')}\n"
            )
        )

    caution_instruction = ""
    if requires_cautious_wording:
        caution_instruction += "표현은 신중하고 조건부로 작성하세요.\n"
    if requires_warning_notice:
        caution_instruction += "유의사항에 경고 문구를 반드시 포함하세요.\n"

    system_parts = [
        settings.prompt_instruction.system_prompt.strip() or "당신은 공공기관 문서기반 안내 챗봇입니다.",
        * _build_policy_instruction(settings),
        * _build_style_instruction(settings),
        _build_section_instruction(settings),
        settings.prompt_instruction.additional_instructions.strip(),
        caution_instruction.strip(),
    ]
    system_prompt = "\n".join([part for part in system_parts if part])

    user_prompt = (
        f"사용자 질문: {question}\n"
        f"정규화 질의: {normalized_query}\n\n"
        "아래 근거만 사용해 답변하세요.\n"
        + "\n".join(source_lines)
        + "\n출처 표시는 [S번호] 형태로 유지하세요."
    )

    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}

from typing import Any

from app.schemas.answer_settings import AnswerSettings


def _build_section_instruction(settings: AnswerSettings) -> str:
    if settings.answer_format.answer_template_mode == "fixed_public_service":
        return (
            "답변은 다음 섹션 순서를 우선 고려하세요: 결론, 이유, 세부 안내, 출처, 유의사항. "
            "다만 질문 성격상 불필요한 섹션은 생략해도 됩니다."
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
        "당신은 공공기관 안내 챗봇입니다.",
        "근거 문서에 있는 내용만 사용하고, 없는 사실을 지어내지 마세요.",
        "질문과 직접 관련된 근거가 일부라도 있으면 그 범위 안에서 먼저 설명하세요.",
        "정확히 확인되지 않는 부분만 제한적으로 모른다고 말하세요.",
    ]
    if settings.answer_policy.require_citations:
        lines.append("주요 사실 설명 뒤에는 [S1], [S2] 형식의 출처 표기를 유지하세요.")
    if settings.answer_policy.disallow_definitive_claims:
        lines.append("무조건, 반드시, 100% 같은 단정 표현은 피하세요.")
    if settings.answer_policy.disallow_outcome_prediction:
        lines.append("심사 결과나 승인 가능성 예측은 하지 마세요.")
    if settings.answer_policy.disallow_legal_judgment:
        lines.append("법률 판단이나 해석은 하지 말고 담당 부서 확인을 권하세요.")
    if settings.answer_policy.require_latest_source_check_warning_when_relevant:
        lines.append("최신성 확인이 중요하면 답변 끝에 최신 기준 재확인 안내를 덧붙이세요.")
    if settings.escalation_operating.enable_escalation_suggestion:
        lines.append("근거가 부족한 핵심 부분은 담당 부서 문의를 권할 수 있습니다.")
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
        text_preview = str(item.get("contentSignals", {}).get("textPreview", "") or "").strip()
        source_lines.append(
            (
                f"[S{index}] 제목: {item.get('documentName')}\n"
                f"버전: {item.get('versionLabel')} | 소스: {item.get('sourceType')} | 코퍼스: {item.get('corpusDomain')}\n"
                f"페이지: {item.get('pageNumber')} | 섹션: {item.get('sectionTitle')}\n"
                f"관련도 점수: {item.get('combinedScore')}\n"
                f"근거 본문:\n{text_preview}\n"
            )
        )

    caution_instruction = ""
    if requires_cautious_wording:
        caution_instruction += "표현은 신중하고 조건부로 작성하세요.\n"
    if requires_warning_notice:
        caution_instruction += "필요하면 최신 기준 재확인 안내를 포함하세요.\n"

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
        f"정규화 질의: {normalized_query}\n\n"
        "아래 근거만 사용해 질문에 직접 답변하세요.\n"
        "근거에 실제 사업명, 지원 내용, 대상, 절차가 보이면 이를 먼저 요약해서 설명하세요.\n"
        "근거가 일부만 있어도 그 범위 안에서 최대한 설명하고, 모르는 부분만 제한적으로 밝히세요.\n\n"
        + "\n".join(source_lines)
        + "\n출처 표시는 [S번호] 형식으로 유지하세요."
    )

    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}

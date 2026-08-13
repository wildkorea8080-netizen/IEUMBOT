from datetime import date as _date
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
        # 주제-일치 가드: 단어만 겹치고 대상이 다른 근거로 대신 답하는 것을 막는다.
        # (예: '광역자원순환센터 예약방법' 질문에 '캠핑장 예약방법' 근거로 답하는 오류)
        "질문의 핵심 대상(시설명·기관명·사업명 등 고유명사)을 먼저 확인하세요. "
        "근거가 질문과 다른 대상에 관한 내용이면(‘예약방법’·‘이용안내’처럼 단어가 우연히 겹쳐도) "
        "그 내용으로 대신 답하지 말고, ‘등록된 자료에서 (질문 대상)에 대한 내용을 찾지 못했습니다’라고 "
        "밝힌 뒤 공식 홈페이지나 담당 부서 확인을 안내하세요.",
        "이용자가 ‘아니다’·‘왜 다른 걸 알려주냐’처럼 직전 답변이 빗나갔다고 지적하면, "
        "같은 대상 정보를 반복하지 말고 질문의 원래 대상을 기준으로 다시 확인하세요.",
        "단순 인사에는 자연스럽게 응답한다.",
        "질문이 모호하면 바로 이관하지 말고 먼저 추가 정보를 요청한다.",
        "담당 부서 연결은 최후 수단으로만 안내한다.",
        "가능하면 참고한 문서명이나 웹페이지명을 함께 안내한다.",
        "한국어로 답변한다.",
        "이용자의 요청을 먼저 짧게 받아주고, 바로 필요한 정보를 구체적으로 안내하세요.",
        "답변 첫 문장은 '네, 요청하신 내용을 안내해 드릴게요.'처럼 부드러운 확인 문장으로 시작하세요.",
        "근거 문서에 있는 내용만 사실로 말하고, 근거에 없는 세부 일정/자격/신청 링크는 만들어내지 마세요.",
        "근거가 일부만 있으면 확인 가능한 범위와 추가 확인이 필요한 범위를 분리해 말하세요.",
    ]
    if settings.answer_policy.suggest_next_question:
        lines.append(
            "답변 끝에는 '원하시면 신청 방법도 이어서 안내해 드릴까요?'처럼 "
            "사용자가 다음으로 물어볼 만한 한 가지 선택지를 자연스럽게 제안하세요."
        )
    else:
        lines.append(
            "답변 끝에 '원하시면 ~도 안내해 드릴까요?'처럼 되묻는 제안은 붙이지 마세요. "
            "필요한 내용을 안내하고 마무리하세요."
        )
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
    # 톤·길이는 아래에서 실제 행동 지시로 풀어 쓴다. 여기서 내부 열거값
    # ("formal", "medium")을 그대로 프롬프트에 넣으면 같은 말을 두 번 하는 셈이고,
    # 모델이 해석하기 나름이라 지시가 흐려진다.
    lines = [
        f"역할 모드: {settings.prompt_instruction.assistant_role_mode}",
        f"답변 스타일: {settings.prompt_instruction.answer_style_mode}",
        "문장은 부드럽고 존중하는 한국어로 작성하되, 과장된 위로나 확정적 약속은 피하세요.",
        "목록은 3~6개 정도로 정리하고, 각 항목은 한두 문장으로 구체화하세요.",
    ]

    # 말투 — 관리 화면의 '응답 톤 설정' 세 가지에 대응한다.
    # 어조만 맡고 분량은 건드리지 않는다. 그래야 아래 '답변 길이'와 조합된다
    # (간결한 어조 + 자세히 = 짧은 문장들로 자세히).
    tone = settings.prompt_instruction.tone_mode
    if tone == "formal":
        # 공공기관형 — 격식 있고 단정한 안내 중심
        lines.append(
            "격식 있고 단정한 공공기관 안내문 어조로 답변하세요. "
            "구어체·감탄사·이모티콘은 쓰지 마세요."
        )
    elif tone == "plain":
        # 간결한 안내형 — 핵심 위주로 짧고 빠르게.
        # 예전에는 "친근하고 이해하기 쉬운 말투"로 매핑돼 있어, 이 항목을 골라도
        # 답변이 전혀 간결해지지 않았다(간결함과 친근함은 다른 축이다).
        lines.append(
            "군더더기 없이 핵심만 짧은 문장으로 전달하세요. "
            "인사말·사과·서론 없이 바로 본론부터 쓰세요."
        )
    else:  # polite (기본) — 친절한 상담형: 부드럽고 설명적인 안내
        lines.append(
            "부드러운 상담원 어조로 존댓말을 쓰고, 왜 그런지 배경이나 이유를 "
            "한 문장 곁들여 설명하세요."
        )

    # 분량 — 관리 화면의 '답변 길이' 세 가지에 대응한다.
    length = settings.answer_format.max_answer_length_mode
    if length == "short":
        lines.append("핵심만 2-3문장으로 간결하게 답변하세요.")
    elif length == "long":
        lines.append("근거와 부연설명, 주의사항까지 상세하게 답변하세요.")
    # medium: 별도 지시 없음 (기존 기본 동작 유지)

    return lines


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
    chatbot_name: str = "",
    institution_name: str = "",
    recent_messages: list[Any] | None = None,
    question_type_flags: dict | None = None,
    uncovered_slots: list[str] | None = None,
    session_entities: dict | None = None,
    custom_instructions: str = "",
    api_context: str | None = None,
) -> dict[str, str]:
    source_lines: list[str] = []
    for index, item in enumerate(candidates[:5], start=1):
        signals      = item.get("contentSignals") or {}
        text_preview = str(signals.get("textPreview", "") or "").strip()
        context_text = str(signals.get("contextText", "") or "").strip()

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

        # context_text: 문서 내 청크 위치 요약 — 있을 때만 근거 본문 앞에 삽입
        body = f"{context_text}\n{text_preview}" if context_text else text_preview

        source_lines.append(
            f"[S{index}] {origin_line}\n"
            f"{section_line}"
            f"관련도: {score:.4f}\n"
            f"근거 본문:\n{body}\n"
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

    _today_str = _date.today().isoformat()

    def _resolve_prompt_vars(text: str) -> str:
        """시스템 프롬프트 내 변수를 런타임 값으로 치환합니다."""
        return (
            text
            .replace("{today}", _today_str)
            .replace("{chatbot_name}", chatbot_name)
            .replace("{institution_name}", institution_name)
        )

    # 기관별 추가 지시문: custom_instructions 가 있으면 마지막에 삽입
    custom_instr_part = f"추가 지시사항: {custom_instructions.strip()}" if custom_instructions and custom_instructions.strip() else ""

    # 외부 API 실시간 데이터는 유저 프롬프트(질문 바로 아래)에 넣는다.
    # 시스템 프롬프트 끝에 두면 모델이 질문 옆에 붙은 RAG 근거로만 답하고 이 블록을
    # 무시한다 — API가 정상 호출되고 3천 자가 주입됐는데도 답변에 전혀 반영되지 않던
    # 원인이다. 주제 게이트를 유저 프롬프트로 옮긴 것과 같은 이유다.
    api_context_part = (
        f"[실시간 데이터]\n{api_context.strip()}\n"
        "위 실시간 데이터는 현재 시스템에서 직접 조회한 최신 정보입니다. "
        "관련 질문에는 이 정보를 우선 참고하세요.\n\n"
    ) if api_context and api_context.strip() else ""

    system_parts = [
        _resolve_prompt_vars(
            settings.prompt_instruction.system_prompt.strip() or "너는 기관의 AI 상담 챗봇이다."
        ),
        *_build_policy_instruction(settings),
        *_build_style_instruction(settings),
        _build_section_instruction(settings),
        _resolve_prompt_vars(settings.prompt_instruction.additional_instructions.strip()),
        type_instruction.strip(),
        slot_notice.strip(),
        caution_instruction.strip(),
        custom_instr_part,
    ]
    system_prompt = "\n".join([part for part in system_parts if part])

    history_block = _build_history_block(recent_messages)
    entity_block = format_entities_for_prompt(session_entities)

    # 주제-적합성 게이트 — "근거 사용" 지시보다 먼저 읽히도록 맨 앞에 둔다.
    # 질문·근거 바로 옆(유저 프롬프트)이라 시스템 프롬프트의 같은 지시보다 강하게 작동한다.
    # 목적: 단어만 겹치고 대상이 다른 근거로 대신 답하는 것을 차단
    #       (예: '광역자원순환센터 예약방법' 질문에 '캠핑장 예약방법' 근거로 답하는 오류).
    subject_gate = (
        "[근거 적합성 먼저 확인] 아래 근거가 사용자 질문의 핵심 대상"
        "(질문에 등장한 시설명·기관명·사업명 등)에 관한 것인지 먼저 판단하세요. "
        "근거가 질문과 다른 대상에 관한 내용이면 — ‘예약방법’·‘이용안내’처럼 일부 단어만 "
        "겹치는 경우도 포함 — 그 근거로 답하지 말고, 다른 대상의 정보를 대신 제시하지 마세요. "
        "이때는 근거 내용을 옮기지 말고 ‘요청하신 내용은 등록된 자료에서 확인되지 않습니다. "
        "정확한 안내는 공식 홈페이지나 담당 부서로 문의해 주세요.’라고만 답하세요.\n"
    )
    # 실시간 API 데이터가 있으면 그것도 유효 근거로 명시 (그렇지 않으면 "아래 근거만 사용"
    # 지시 때문에 시스템의 [실시간 데이터]를 LLM이 무시할 수 있음).
    evidence_instruction = subject_gate + (
        "근거가 질문 대상과 일치하면, 위 [실시간 데이터]와 아래 근거를 사용해 질문에 직접 답하세요. "
        "실시간 데이터가 질문과 직접 관련되면 그 내용을 우선 활용하세요.\n"
        if api_context and api_context.strip()
        else "근거가 질문 대상과 일치하면, 아래 근거만 사용해 질문에 직접 답하세요.\n"
    )
    # 되묻는 마무리 문장은 정책 토글을 따른다 (끄면 답변 본문에 제안이 붙지 않음).
    closing_hint = (
        "- 필요하면 더 궁금한 점을 물어보라는 친근한 한 문장으로 마무리해도 좋습니다.\n"
        if settings.answer_policy.suggest_next_question
        else "- 되묻는 제안이나 '~해 드릴까요?' 문장 없이 안내를 마무리하세요.\n"
    )
    user_prompt = (
        history_block
        + entity_block
        + f"사용자 질문: {question}\n"
        f"정규화 질문: {normalized_query}\n\n"
        + api_context_part
        + evidence_instruction
        + "기관 소개나 사업 안내 질문이면 확인되는 사업명, 대상, 제공 내용, 참여/문의 방법을 구체적으로 정리하세요.\n"
        "교육 일정, 자격요건, 신청 기간처럼 근거에 정확한 값이 없으면 임의로 만들지 말고 공식 공지 확인이 필요하다고 말하세요.\n"
        "근거 본문에 의미를 알 수 없는 깨진 문자·기호 조각(한글과 무관한 영문·숫자·기호가 어지럽게 뒤섞인 부분 등)이 있으면 "
        "그대로 옮기지 말고, 명확히 읽히는 정보(전화번호·이메일·날짜·자격요건 등)만 정제해 제시하세요. 근거 원문을 통째로 복사하지 마세요.\n"
        "답변은 한 문단으로 늘어놓지 말고 읽기 쉽게 구조화하세요:\n"
        "- 맨 앞은 질문에 공감하는 짧은 한 문장으로 시작하세요(예: '~에 대해 안내해 드릴게요').\n"
        "- 내용이 여러 갈래면 '## 소제목' 앞에 상황에 맞는 이모지 1개를 붙여 구분하세요(예: '## 📋 신청 절차', '## 🏢 시설 안내'). "
        "이모지는 소제목·마무리에 1~2개만 쓰고 문장마다 남발하지 마세요.\n"
        "- 항목이 2개 이상이고 각 항목의 내용이 **한 줄로 짧게** 들어가면(예: 전화번호, 날짜, 담당부서) 마크다운 표로 정리하세요.\n"
        "- **표 금지 조건**: 한 칸에 들어갈 내용이 길거나 두 가지 이상이면 표를 쓰지 마세요. "
        "표 칸 안에서 줄을 바꾸거나 '- ' 목록을 넣으면 안 됩니다(표가 깨집니다). "
        "이럴 때는 '**구분명**' 뒤에 '- ' 목록을 쓰는 형식으로 작성하세요:\n"
        "**대상/자격**\n"
        "- 고용보험 가입자\n"
        "- 비자발적 이직\n"
        "- 단순 나열도 '- ' 목록으로.\n"
        "- **중요(줄바꿈)**: 소제목, 표의 각 행, 목록의 각 항목은 반드시 실제 줄바꿈(엔터)으로 구분하세요. "
        "한 줄에 이어 붙이지 마세요. 표는 정확히 아래 형식처럼 각 행을 새 줄에 쓰세요:\n"
        "## 소제목\n"
        "| 구분 | 내용 |\n"
        "| --- | --- |\n"
        "| 대상 | 관련 법인 |\n"
        "| 방법 | 온라인 접수 |\n"
        "- 관련 웹페이지·신청·문의 링크가 있으면 [표시할 텍스트](URL) 형식의 마크다운 링크로, 핵심어는 **굵게** 강조하세요.\n"
        + closing_hint
        + "본문에 [S1], [S2] 같은 출처 번호 표기는 넣지 마세요 — 출처는 답변과 별도로 화면에 자동 표시됩니다.\n\n"
        + "\n".join(source_lines)
    )

    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}

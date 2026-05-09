"""
entity_extraction_service.py
대화 텍스트에서 엔티티를 키워드 매칭으로 추출하고
chat_sessions.context_entities에 누적 저장.

LLM 호출 없음 — 키워드 매칭만 사용 (성능 영향 최소화)
"""
from __future__ import annotations

import re
from typing import Any

# ── 엔티티 추출 패턴 ─────────────────────────────────────
# 사업명 패턴: "~사업", "~지원", "~프로그램", "~과정" 앞 2~15자 한글+숫자
_PROGRAM_PATTERN = re.compile(
    r"([가-힣a-zA-Z0-9]{2,10}(?:\s[가-힣a-zA-Z0-9]{1,6}){0,2}\s*"
    r"(?:사업|지원사업|지원프로그램|지원제도|프로그램|과정|서비스|제도|정책))"
)

# 사용자 프로필 힌트 키워드
_PROFILE_KEYWORDS: dict[str, list[str]] = {
    "중소기업":   ["중소기업", "중소 기업", "소기업", "소상공인"],
    "대학생":     ["대학생", "대학교", "재학생", "졸업예정"],
    "농업인":     ["농업인", "농민", "농가", "영농"],
    "개인":       ["개인", "일반인", "개인사업자"],
    "비영리":     ["비영리", "사단법인", "재단법인", "NGO"],
}

# 자격 조건 힌트 키워드
_QUALIFICATION_KEYWORDS: list[str] = [
    "자격", "요건", "조건", "제한", "대상", "해당", "가능", "불가", "제외",
]

# 질문 토픽 키워드
_TOPIC_KEYWORDS: dict[str, list[str]] = {
    "신청방법":  ["신청", "접수", "제출", "등록"],
    "자격요건":  ["자격", "요건", "조건", "대상"],
    "지원금액":  ["금액", "지원금", "보조금", "예산", "비용"],
    "신청기간":  ["기간", "기한", "마감", "일정", "언제"],
    "연락처":    ["전화", "연락처", "담당자", "문의"],
}


def extract_entities_from_turn(
    question: str,
    answer: str,
) -> dict[str, Any]:
    """
    질문+답변 텍스트에서 엔티티를 추출해 반환.
    반환 구조:
    {
        "mentionedPrograms": ["사업명1", ...],   # 최대 5개
        "userProfileHints":  {"중소기업": True}, # 해당하는 것만
        "askedTopics":       ["신청방법", ...],  # 최대 3개
    }
    """
    combined = f"{question} {answer}"

    # 사업명 추출
    programs = list(dict.fromkeys(  # 순서 유지 중복 제거
        m.strip() for m in _PROGRAM_PATTERN.findall(combined)
        if len(m.strip()) >= 4  # 너무 짧은 것 제외
    ))[:5]

    # 사용자 프로필 힌트
    profile: dict[str, bool] = {}
    q_lower = question.lower()
    for profile_type, keywords in _PROFILE_KEYWORDS.items():
        if any(kw in q_lower for kw in keywords):
            profile[profile_type] = True

    # 질문 토픽
    topics: list[str] = []
    for topic, keywords in _TOPIC_KEYWORDS.items():
        if any(kw in q_lower for kw in keywords):
            topics.append(topic)
    topics = topics[:3]

    return {
        "mentionedPrograms": programs,
        "userProfileHints":  profile,
        "askedTopics":       topics,
    }


def merge_context_entities(
    existing: dict[str, Any] | None,
    new_entities: dict[str, Any],
) -> dict[str, Any]:
    """
    기존 누적 엔티티에 새 엔티티를 병합.
    - mentionedPrograms: 합집합, 최신 우선, 최대 10개 유지
    - userProfileHints: 새 값이 True면 추가 (한번 감지되면 유지)
    - askedTopics: 합집합, 최대 10개 유지
    """
    existing = existing or {}

    # 사업명: 새것을 앞에 두고 기존 것 뒤에 붙임 (최신 우선)
    old_programs = existing.get("mentionedPrograms") or []
    new_programs = new_entities.get("mentionedPrograms") or []
    merged_programs = list(dict.fromkeys(new_programs + old_programs))[:10]

    # 프로필 힌트: OR 병합
    old_profile = existing.get("userProfileHints") or {}
    new_profile = new_entities.get("userProfileHints") or {}
    merged_profile = {**old_profile, **new_profile}

    # 토픽: 합집합, 최대 10개
    old_topics = existing.get("askedTopics") or []
    new_topics = new_entities.get("askedTopics") or []
    merged_topics = list(dict.fromkeys(new_topics + old_topics))[:10]

    return {
        "mentionedPrograms": merged_programs,
        "userProfileHints":  merged_profile,
        "askedTopics":       merged_topics,
    }


def format_entities_for_prompt(
    context_entities: dict[str, Any] | None,
) -> str:
    """
    context_entities를 LLM 프롬프트 삽입용 텍스트로 변환.
    비어있으면 빈 문자열 반환.
    """
    if not context_entities:
        return ""

    parts: list[str] = []

    programs = context_entities.get("mentionedPrograms") or []
    if programs:
        parts.append(f"이전 대화에서 언급된 사업: {', '.join(programs)}")

    profile = context_entities.get("userProfileHints") or {}
    if profile:
        parts.append(f"사용자 유형: {', '.join(profile.keys())}")

    topics = context_entities.get("askedTopics") or []
    if topics:
        parts.append(f"이전에 문의한 항목: {', '.join(topics)}")

    if not parts:
        return ""

    return "[이전 대화 맥락]\n" + "\n".join(parts) + "\n———\n"

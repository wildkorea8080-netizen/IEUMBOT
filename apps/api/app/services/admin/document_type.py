"""문서 유형 판별 — 2계층 예외 처리기의 진입점.

공통 경로(추출 → 헤딩 분할 → 질문형 제목)가 대부분의 문서를 처리한다.
여기서는 **공통 경로가 망가뜨리는 문서만** 골라낸다. 파이프라인을 유형별로
나누는 게 아니라, 공통 경로를 덮어쓰는 작은 핸들러를 붙이는 구조다.

핸들러 추가 방법:
  1. DocType에 값을 하나 늘린다.
  2. `_score_<유형>(text) -> tuple[float, str]` 형태의 점수 함수를 쓴다.
     (0.0~1.0 확신도, 사람이 읽을 판정 근거)
  3. _DETECTORS에 (DocType, 점수함수) 를 우선순위 순서로 끼운다.
  4. 호출부(knowledge_staging_service)에서 그 유형의 처리 분기를 만든다.

판별은 반드시 틀린다. 그래서 근거(reason)를 항상 남기고, 관리자가 유형을
바꿀 수 있게 하는 것이 최종 안전장치다(3계층).
"""

import re
from dataclasses import dataclass
from enum import Enum

# 판정 임계값. 오탐(멀쩡한 문서를 서식으로 봄)이 미탐보다 훨씬 나쁘다 —
# 관리자는 아무것도 못 받고 이유도 모른다. 그래서 높게 잡는다.
_FORM_THRESHOLD = 0.6


class DocType(str, Enum):
    GENERAL = "general"  # 공통 경로
    QA = "qa"  # 이미 질의응답 형식 → 원문 그대로 보존
    FORM = "form"  # 빈 서식·신청서 → 지식이 되지 않는다


@dataclass(frozen=True)
class DocTypeVerdict:
    doc_type: DocType
    confidence: float
    reason: str


# Q1. / 질문 1 / 문1. 같은 질의응답 마커
_QA_MARKER = re.compile(r"^\s*(?:Q\s*\d*[.)]|질문\s*\d*[.)]?|문\s*\d+[.)])", re.MULTILINE)

# 빈 칸: 밑줄 연속, 괄호 안 공백, 점선
_BLANK_SLOT = re.compile(r"_{3,}|\(\s{2,}\)|\[\s{2,}\]|…{3,}|\.{5,}")

# "성명 :" 처럼 라벨 뒤에 값이 없는 줄
_EMPTY_LABEL = re.compile(
    r"^\s*[가-힣A-Za-z][가-힣A-Za-z0-9 ()·/]{0,18}\s*[:：]\s*(?:_+|\(\s*\)|\.{2,}|)\s*$",
    re.MULTILINE,
)

# 서식임을 자기 선언하는 표현
_FORM_DECLARATION = re.compile(r"별지\s*제?\s*\d*\s*호|서식|기재\s*요령|\(서명\s*(?:또는|/)?\s*인\)")

# 서식 제목 — 문서 어딘가에 '○○신청서/신고서' 가 제목처럼 짧은 줄로 있는지
_FORM_TITLE = re.compile(r"^\s*\S{0,20}(?:신청서|신고서|의뢰서|동의서|확인서)\s*$", re.MULTILINE)


def _score_qa(text: str) -> tuple[float, str]:
    markers = len(_QA_MARKER.findall(text))
    if markers < 2:
        return 0.0, ""
    # 마커가 많을수록 확신이 커진다. 5개면 사실상 확정.
    return min(1.0, 0.5 + markers * 0.1), f"질의응답 마커 {markers}개"


def _score_form(text: str) -> tuple[float, str]:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return 0.0, ""

    blanks = len(_BLANK_SLOT.findall(text))
    empty_labels = len(_EMPTY_LABEL.findall(text))
    declared = bool(_FORM_DECLARATION.search(text))
    titled = bool(_FORM_TITLE.search(text))

    # 빈 칸·빈 라벨이 전체 줄에서 차지하는 비율. 서식은 이 값이 크다.
    blank_ratio = (blanks + empty_labels) / len(lines)

    signals: list[str] = []
    score = 0.0
    if blank_ratio >= 0.3:
        score += 0.5
        signals.append(f"빈 칸 비율 {blank_ratio:.0%}")
    elif blank_ratio >= 0.15:
        score += 0.25
        signals.append(f"빈 칸 비율 {blank_ratio:.0%}")
    if declared:
        score += 0.25
        signals.append("서식 선언 표현")
    if titled:
        score += 0.25
        signals.append("서식 제목")

    # 낱말만 보고 판정하지 않는다 — '신청서를 제출하십시오' 같은 안내문이
    # 통째로 버려지는 걸 막는 조건이다. 빈 칸이 없으면 서식이 아니다.
    if blank_ratio < 0.15:
        return 0.0, ""

    return min(1.0, score), ", ".join(signals)


# 우선순위 순서. Q&A 사례집에 서식 예시가 딸려 있어도 Q&A로 다뤄야
# 원문 질의응답이 보존되므로 Q&A를 먼저 본다.
_DETECTORS = [
    (DocType.QA, _score_qa, 0.5),
    (DocType.FORM, _score_form, _FORM_THRESHOLD),
]


def detect_document_type(text: str) -> DocTypeVerdict:
    """문서 유형과 판정 근거를 돌려준다. 확신이 없으면 GENERAL."""
    if not text or not text.strip():
        return DocTypeVerdict(DocType.GENERAL, 0.0, "본문 없음")

    for doc_type, scorer, threshold in _DETECTORS:
        confidence, reason = scorer(text)
        if confidence >= threshold:
            return DocTypeVerdict(doc_type, confidence, reason)

    return DocTypeVerdict(DocType.GENERAL, 0.0, "특이 유형 신호 없음")

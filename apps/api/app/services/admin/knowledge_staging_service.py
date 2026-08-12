"""
지식 스테이징 서비스 — 업로드 후 AI 분석 → 사용자 검토 → 개별 등록.

흐름:
  파일/텍스트 업로드
    → _split_semantic_chunks()   : 헤딩 계층 기반 섹션 분할 (헤딩 없으면 단락 폴백)
    → 제목은 문서 헤딩을 그대로 사용 (헤딩 없을 때만 LLM/규칙 기반 생성)
    → detect_pii()               : 민감정보 감지
    → _find_faq_merge_candidate(): 기존 등록 주제(FAQ)와 유사도 검사 → 같으면 등록 시 갱신
    → KnowledgeStagingSession/Chunk 저장
  사용자 검토 후 register_chunks() 호출
    → createKnowledgeText() 내부 서비스로 각 청크를 지식으로 등록
"""

import json
import logging
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from html import escape as _html_escape
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_staging import KnowledgeStagingChunk, KnowledgeStagingSession
from app.services.admin.document_type import DocType, detect_document_type
from app.services.admin.pii_detector_service import detect_pii
from app.services.chat.answer_generation_service import (
    _call_anthropic,
    _call_openai_like,
    _extract_output_text_anthropic,
    _extract_output_text_openai,
)

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 1200
_CHUNK_OVERLAP = 150
# 20청크 = 약 24,000자. 수십 쪽짜리 매뉴얼·사례집이면 앞 몇 쪽(대개 일러두기·목차)만
# 분석하고 본문을 통째로 버리게 되어, 추천 주제가 중복되고 내용이 잘리는 원인이었다.
_MAX_CHUNKS_PER_SESSION = int(os.getenv("STAGING_MAX_CHUNKS", "200"))
# 섹션을 청크로 남길 최소 본문 길이. 제목이 있으면 짧아도 하나의 항목이므로 살린다
# ("무료입니다."는 6자다). 4자 미만은 쪽번호·OCR 잔여물로 보고 버린다.
_MIN_TITLED_BODY = 4
_MIN_UNTITLED_BODY = 60
_ANALYZE_CONCURRENCY = max(1, int(os.getenv("STAGING_ANALYZE_CONCURRENCY", "6")))

# 섹션 헤딩 패턴 — (계층, 정규식). 앞에 오는 것이 우선한다.
# 계층 1은 문서 대분류(장), 2는 중분류, 3은 그 아래 항목이다.
_HEADING_LEVELS: list[tuple[int, re.Pattern[str]]] = [
    (1, re.compile(r"^제\s*\d+\s*장\b")),                     # 제1장
    (1, re.compile(r"^[IVX]{1,5}\.\s+\S")),                   # I. II. III.
    (2, re.compile(r"^제\s*\d+\s*[절조항]\b")),                # 제1절 / 제2조
    (2, re.compile(r"^\d{1,2}[.)]\s+\S")),                    # 1. 제목 / 1) 제목
    (3, re.compile(r"^\d{1,2}[-.]\d{1,2}[.)]?\s+\S")),        # 1-1 / 1.1
    (3, re.compile(r"^[①-⑳⑴-⑽]\s*\S")),                       # ① 제목
    (3, re.compile(r"^[□■▶▷◆◇●○★☆]\s*\S")),                  # □ 제목
    (3, re.compile(r"^[A-Z][A-Z ]{3,30}$")),                  # ALL CAPS 영문
    # 번호·기호 없는 짧은 한글 제목. 가장 느슨하므로 마지막에 둔다.
    (3, re.compile(r"^[가-힣]{2,15}(?:\s+[가-힣A-Za-z0-9()·]{1,12}){0,3}$")),
]

# 헤딩 앞에 붙는 번호·기호. FAQ 질문으로 쓸 때는 떼어 낸다.
_HEADING_MARKER_RE = re.compile(
    r"^(?:제\s*\d+\s*[장절조항]|\d{1,2}(?:[-.]\d{1,2})?\s*[.)]?|[①-⑳⑴-⑽]|[□■▶▷◆◇●○★☆])\s*"
)

# 종결어미로 끝나면 제목이 아니라 문장이다. 기존 규칙은 이 구분이 없어
# "이용료는 무료입니다" 같은 평범한 문장을 제목으로 잡아 섹션을 잘못 끊었다.
_SENTENCE_TAIL_RE = re.compile(r"(?:다|요|임|함|음|까|죠|네|오)[.!?]?$")


def _heading_level(line: str) -> int | None:
    """제목이면 계층(1~3), 아니면 None."""
    line = line.strip()
    if not line or len(line) > 80:
        return None
    if _SENTENCE_TAIL_RE.search(line):
        return None
    for level, pattern in _HEADING_LEVELS:
        if pattern.match(line):
            return level
    return None


def _is_heading(line: str) -> bool:
    return _heading_level(line) is not None


@dataclass
class DocumentSection:
    """문서에서 잘라낸 한 조각 + 그 조각이 놓인 위치."""

    text: str
    heading: str | None = None  # 이 조각의 제목(문서에 적힌 그대로)
    category: str | None = None  # 상위 계층 제목 — FAQ 분류로 쓴다
    field: str | None = None  # 바로 위 제목 — FAQ 세부분야로 쓴다
    part: int = 1  # 긴 섹션이 나뉜 경우 몇 번째 조각인지
    part_count: int = 1


def _split_sentences(text: str) -> list[str]:
    """문장 경계로 나눈다. 한국어 공문서는 '~한다.' 형태가 대부분이다."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _pack_units(units: list[str], limit: int, joiner: str) -> list[str]:
    """조각들을 limit 이하로 이어 붙인다. limit을 넘는 단일 조각은 그대로 둔다."""
    packed: list[str] = []
    current = ""
    for unit in units:
        if not current:
            current = unit
        elif len(current) + len(joiner) + len(unit) <= limit:
            current = current + joiner + unit
        else:
            packed.append(current)
            current = unit
    if current:
        packed.append(current)
    return packed


def _split_body(body: str, limit: int) -> list[str]:
    """본문을 limit 이하 조각으로 나눈다. 문장 중간은 자르지 않는다.

    단락 → 줄 → 문장 순으로 경계를 낮춰 가며 시도하고, 그래도 limit을 넘는
    문장 하나만 남으면 어쩔 수 없이 그대로 둔다(자르면 뜻이 깨지므로).
    """
    if len(body) <= limit:
        return [body] if body.strip() else []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", body) if p.strip()]
    if len(paragraphs) <= 1:
        paragraphs = [ln.strip() for ln in body.split("\n") if ln.strip()]

    units: list[str] = []
    for para in paragraphs:
        units.extend([para] if len(para) <= limit else _split_sentences(para))

    return [c for c in _pack_units(units, limit, "\n") if c.strip()]


def _split_semantic_chunks(text: str) -> list[DocumentSection]:
    """문서를 헤딩 계층대로 섹션으로 나눈다.

    헤딩은 제목으로 그대로 쓰고(LLM이 새로 짓지 않는다), 상위 헤딩은
    분류·세부분야로 넘긴다. 헤딩이 없으면 단락 기반으로 폴백한다.
    """
    lines = text.splitlines()
    # (계층, 제목) 스택 — 현재 위치의 상위 경로를 담는다.
    trail: list[tuple[int, str]] = []
    # (제목, 분류, 세부분야, 본문 줄들)
    blocks: list[tuple[str | None, str | None, str | None, list[str]]] = []
    current: list[str] = []
    heading: str | None = None
    category: str | None = None
    field: str | None = None

    def flush() -> None:
        if heading is not None or "\n".join(current).strip():
            blocks.append((heading, category, field, current))

    for line in lines:
        level = _heading_level(line)
        if level is None:
            current.append(line)
            continue

        flush()
        current = []
        title = line.strip()
        while trail and trail[-1][0] >= level:
            trail.pop()
        trail.append((level, title))
        # 분류는 최상위 계층. 세부분야는 최상위와 자기 자신 사이에 낀 계층이 있을 때만
        # 채운다 — 없는데 억지로 넣으면 제목과 똑같은 값이 FAQ에 중복으로 들어간다.
        category = trail[0][1] if len(trail) > 1 else None
        field = trail[1][1] if len(trail) > 2 else None
        heading = title
    flush()

    # 헤딩이 하나도 없을 때만 단락 기반으로 폴백한다.
    # (예전에는 3개 미만이면 버렸는데, 헤딩 판정이 느슨해 오탐을 걸러내려던 장치였다.
    #  지금은 종결어미·계층 규칙으로 걸러내므로 하나라도 있으면 쓰는 편이 낫다.)
    titled = [b for b in blocks if b[0] is not None]
    if not titled:
        paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
        blocks = [(None, None, None, [p]) for p in paragraphs]

    sections: list[DocumentSection] = []
    for block_heading, block_category, block_field, body_lines in blocks:
        body = "\n".join(body_lines).strip()
        # 본문 없는 장 제목은 청크가 되지 않고 경로(분류) 정보로만 남는다.
        # 제목이 붙어 있으면 본문이 짧아도 살린다 — "수수료: 무료입니다" 같은
        # 한 줄짜리 항목을 길이만 보고 버리면 관리자는 누락 사실조차 모른다.
        floor = _MIN_TITLED_BODY if block_heading else _MIN_UNTITLED_BODY
        if len(body) < floor:
            continue
        pieces = _split_body(body, _CHUNK_SIZE)
        for index, piece in enumerate(pieces, start=1):
            full = f"{block_heading}\n{piece}" if block_heading else piece
            sections.append(
                DocumentSection(
                    text=full,
                    heading=block_heading,
                    category=block_category,
                    field=block_field,
                    part=index,
                    part_count=len(pieces),
                )
            )

    return sections[:_MAX_CHUNKS_PER_SESSION]


# ── Q&A 형식 감지·추출 (원문 보존, 재작성 없음) ──────────────────────────────────
# 문서가 이미 질의응답(Q1./질문/문답) 형식이면 LLM 재작성 없이 각 쌍을 원문 그대로
# 추출해 FAQ 질문/답변으로 쓴다. (일반 문서용 주제추출·재작성이 Q&A를 쪼개고 답변을
# 날조하던 문제 해결.)
# PDF 추출기가 줄바꿈을 공백으로 평탄화하므로(한 줄로 이어짐) 줄 시작이 아니라
# "공백/문자열 시작" 경계로 마커를 찾는다. (줄바꿈이 남아있는 텍스트도 \s로 포함)
_QA_MARKER_RE = re.compile(r"(?i)(?:(?<=\s)|^)(?:Q\s*\d+|질문\s*\d*|문\s*\d+)\s*[.\):]\s*")
_ANS_LABEL_RE = re.compile(r"(?i)(?:(?<=\s)|^)(?:답변|A)\s*[.\):]\s*")


def _reflow_segment(seg: str) -> str:
    """PDF 줄바꿈 잔여물 정리 — 문단(빈 줄) 경계는 유지, 단일 개행은 공백으로 결합.

    내용은 절대 바꾸지 않는다(요약·생략·창작 없음). 줄바꿈만 정리.
    """
    paragraphs = re.split(r"\n[ \t]*\n", seg)
    out: list[str] = []
    for para in paragraphs:
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if lines:
            out.append(" ".join(lines))
    return "\n\n".join(out).strip()


def _split_question_answer(block: str) -> tuple[str, str]:
    """Q 마커 뒤 블록을 (질문, 답변)으로 분리. 답변 라벨 > 첫 물음표 > 첫 줄 순."""
    label = _ANS_LABEL_RE.search(block)
    if label:
        return block[: label.start()], block[label.end():]
    qmark = block.find("?")
    if qmark >= 0:
        return block[: qmark + 1], block[qmark + 1:]
    parts = block.split("\n", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return block, ""


def _parse_qa_pairs(text: str) -> list[tuple[str, str]] | None:
    """문서가 Q&A 형식이면 (질문, 답변) 쌍 리스트를 원문 그대로 반환, 아니면 None.

    감지 기준: Q1./질문/문 마커가 2개 이상. 각 쌍은 재작성 없이 줄바꿈만 정리.
    """
    if not text or not text.strip():
        return None
    markers = list(_QA_MARKER_RE.finditer(text))
    if len(markers) < 2:
        return None
    pairs: list[tuple[str, str]] = []
    for i, marker in enumerate(markers):
        start = marker.end()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(text)
        block = text[start:end].strip()
        if not block:
            continue
        raw_q, raw_a = _split_question_answer(block)
        question = _reflow_segment(raw_q)[:480]
        answer = _reflow_segment(raw_a)
        if question and answer:
            pairs.append((question, answer))
    return pairs if len(pairs) >= 2 else None


def _build_qa_staging_result(
    sort_order: int,
    question: str,
    answer: str,
    chatbot_id: str,
    db: Session,
    tags: list[str] | None = None,
) -> dict:
    """Q&A 쌍을 staging 청크 dict로 — 질문(간결)=주제명(=FAQ 질문), 답변=내용(원문 그대로).

    tags: [대분류, 소분류, 키워드...] — 등록 시 앞 2개가 category/field로 매핑된다.
    """
    pii_found, pii_regions = detect_pii(answer)
    merge_title, merge_id, merge_score, existing_answer = _find_faq_merge_candidate(
        question, chatbot_id, db
    )
    return {
        "topic_title": question,
        "content": answer,
        "tags": tags or [],
        "pii_detected": pii_found,
        "pii_regions": pii_regions,
        "merge_candidate_title": merge_title,
        "merge_candidate_id": merge_id,
        "merge_score": merge_score,
        # Q&A는 원문 보존이 핵심 — 병합 시에도 기존 답변을 LLM으로 섞지 않고 그대로 둔다.
        "merge_original_content": existing_answer if merge_id else None,
        "registration_type": "merge" if merge_id else "new",
        "sort_order": sort_order,
    }


_DESPACE_SYSTEM = (
    "당신은 PDF에서 추출한 한국어 텍스트의 잘못된 띄어쓰기를 교정합니다.\n"
    "PDF 줄바꿈 때문에 단어 중간에 생긴 불필요한 공백만 제거해 원문을 자연스럽게 복원하세요.\n"
    "절대 규칙: 글자·단어·문장·숫자·기호를 추가/삭제/요약/변경하지 마세요. 오직 띄어쓰기만 조정합니다.\n"
    "교정한 텍스트만 그대로 출력하세요(설명·따옴표·코드블록 금지)."
)


def _despace_pdf_text(text: str, db: Session) -> str:
    """PDF 평탄화로 단어 중간에 생긴 공백을 LLM으로 교정.

    **내용 변조 방지 가드**: 공백을 모두 제거한 결과가 원문과 완전히 같을 때만 채택한다.
    (LLM이 글자/기호를 조금이라도 바꾸면 가드에 걸려 원문 그대로 사용 → 충실성 보장.)
    긴 문서(>8000자)는 건너뜀(부분 교정 시 가드가 항상 실패).
    """
    stripped = re.sub(r"\s+", "", text)
    if len(stripped) < 20 or len(text) > 8000:
        return text
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return text
        cleaned = _call_llm_raw(
            runtime_api, _DESPACE_SYSTEM, text,
            max_tokens=3000, timeout=30, model=runtime_api.speed_model(),
        ).strip()
        if cleaned and re.sub(r"\s+", "", cleaned) == stripped:
            return cleaned
        logger.info("[STAGING] despace rejected (content changed) — keep verbatim")
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STAGING] despace failed: %s", exc)
    return text


_QA_ENRICH_SYSTEM = (
    "당신은 공공기관 챗봇 FAQ를 정리하는 전문가입니다.\n"
    "질의응답 목록을 받아 각 항목에 (1) 간결한 대표 질문 (2) 대분류/소분류 (3) 키워드 태그를 부여합니다.\n"
    "질문·답변의 내용·사실을 바꾸거나 지어내지 마세요. 오직 분류·태그·질문 표현만 다듬습니다.\n"
    "반드시 순수 JSON 배열만 출력하세요(코드블록·설명 금지)."
)


def _enrich_qa_pairs(pairs: list[tuple[str, str]], db: Session) -> list[dict]:
    """각 Q&A에 간결 질문·분류·태그를 부여. pairs와 같은 길이의 [{title, tags}] 반환.

    tags = [대분류, 소분류, 키워드...] (등록 시 앞 2개가 category/field로 매핑됨).
    실패하면 원문 질문 + 빈 태그로 폴백(답변 내용은 어느 경우든 손대지 않음).
    """
    fallback = [{"title": q, "tags": []} for q, _ in pairs]
    if not pairs:
        return fallback
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return fallback
        blocks = [
            f"{i}) 질문: {q[:180]}\n   답변요약: {a[:220]}" for i, (q, a) in enumerate(pairs)
        ]
        user_prompt = (
            "다음 각 질의응답에 메타데이터를 부여해 JSON 배열로만 응답하세요.\n\n"
            + "\n\n".join(blocks)
            + '\n\n형식(항목마다): {"index":0,"title":"간결한 대표 질문(한 문장, 물음표로 끝)",'
            '"category":"대분류(2~6자)","field":"소분류(2~12자)","tags":["키워드",...(2~4개)]}\n'
            "title은 사용자가 실제로 물을 법한 짧고 자연스러운 질문으로. 원문 사실을 바꾸지 마세요."
        )
        raw = _call_llm_raw(runtime_api, _QA_ENRICH_SYSTEM, user_prompt, max_tokens=1500, timeout=30)
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return fallback
        data = json.loads(match.group(0))
        out = list(fallback)
        for item in data:
            if not isinstance(item, dict):
                continue
            try:
                idx = int(item.get("index", -1))
            except (TypeError, ValueError):
                continue
            if not (0 <= idx < len(pairs)):
                continue
            title = str(item.get("title") or "").strip()[:480] or pairs[idx][0]
            category = str(item.get("category") or "").strip()
            field = str(item.get("field") or "").strip()
            keywords = [str(t).strip() for t in (item.get("tags") or []) if str(t).strip()][:4]
            # 중복 제거(순서 유지) — category/field/keyword가 겹쳐도 한 번만.
            seen: set[str] = set()
            tags = [
                t for t in ([category, field, *keywords]) if t and not (t in seen or seen.add(t))
            ][:6]
            out[idx] = {"title": title, "tags": tags}
        return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("[STAGING] qa enrich failed: %s (원문 질문·빈 태그 폴백)", exc)
        return fallback


_FAQ_FORMAT_SYSTEM = (
    "당신은 공공기관 챗봇 FAQ 답변에 '필요한 만큼만' 마크다운 서식을 입히는 편집자입니다.\n"
    "원칙: 원문의 단어·문장·사실을 그대로 두고(재작성·요약·창작·삭제 금지), 가독성이 실제로 좋아질 때만 서식을 더합니다.\n"
    "판단 기준(중요):\n"
    "- 답변이 하나의 자연스러운 설명·서술이면 그대로 문단으로 두세요. **문장 하나하나를 목록(- )으로 쪼개지 마세요.**\n"
    "- '- ' 목록이나 표는 진짜로 항목이 3개 이상 나열되거나(예: 'A, B, C를 지원'), 절차·비교·구분 데이터일 때만 쓰세요.\n"
    "- **굵게**는 정말 핵심 용어 1~3개까지만. 모든 명사를 굵게 하지 마세요.\n"
    "- 소제목(## 이모지 …)은 답변이 여러 갈래로 길 때만 1개. 짧은 답변엔 넣지 마세요.\n"
    "서식이 굳이 필요 없는 답변은 원문을 거의 그대로 두어도 됩니다. 정리된 본문만 출력(설명·코드블록 금지)."
)


def _preserves_facts(original: str, formatted: str) -> bool:
    """서식화 결과가 원문 사실을 보존했는지 검사(누락·창작 방지 가드)."""
    def _tokens(text: str) -> list[str]:
        clean = re.sub(r"[#*_\-|>`~\[\]()]", " ", text)
        return [t for t in re.split(r"[^0-9A-Za-z가-힣]+", clean) if t]

    orig = _tokens(original)
    fmt_set = {t for t in _tokens(formatted)}
    orig_sig = {t for t in orig if len(t) >= 2 or t.isdigit()}
    orig_num = {t for t in orig if any(c.isdigit() for c in t)}
    if not orig_sig:
        return False
    # 숫자 포함 토큰(연락처·날짜·금액)은 전부 보존되어야 함
    if orig_num - fmt_set:
        return False
    coverage = 1 - len(orig_sig - fmt_set) / len(orig_sig)
    inflated = len(fmt_set) > len(orig_sig) * 1.7 + 8  # 과한 창작 방지
    return coverage >= 0.8 and not inflated


def _format_faq_answer(answer: str, db: Session) -> str:
    """FAQ 답변을 마크다운으로 서식화. 사실 보존 가드 실패 시 원문 그대로 유지."""
    text = (answer or "").strip()
    if len(text) < 30 or len(text) > 4000:
        return answer
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return answer
        formatted = _call_llm_raw(
            runtime_api, _FAQ_FORMAT_SYSTEM, text, max_tokens=1600, timeout=30
        ).strip()
        if formatted and _preserves_facts(text, formatted):
            return formatted
        logger.info("[STAGING] faq answer format rejected (facts changed) — keep verbatim")
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STAGING] faq answer format failed: %s", exc)
    return answer


# ── FAQ 답변 디자인 카드(테마 반영 HTML) ──────────────────────────────────────
# 등록 시점에 각 Q&A 답변을 기관 테마 색상이 적용된 카드형 HTML로 변환한다.
# 구조는 전 기관 공통(품질 통일), 색상만 챗봇 primaryColor에서 → 브랜드는 기관별.
# LLM은 원문을 구조(요약·항목·표·주석)로 재배치만 하고(창작 금지), 파이썬이 결정적으로 렌더.
# 사실 보존 가드(_preserves_facts) 실패 시 원문 답변을 그대로 유지(안전 폴백).

_DEFAULT_PRIMARY = "#2563eb"
_CONTACT_PHONE_RE = re.compile(r"0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}")
_CONTACT_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def _normalize_hex(color: Any) -> str | None:
    """테마 색상 문자열을 #rrggbb 6자리 hex로 정규화. 실패 시 None."""
    if not isinstance(color, str) or not color.strip():
        return None
    c = color.strip()
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", c)
    if m:
        return "#" + m.group(1).lower()
    m = re.fullmatch(r"#?([0-9a-fA-F]{3})", c)
    if m:
        h = m.group(1).lower()
        return "#" + "".join(ch * 2 for ch in h)
    m = re.search(r"#([0-9a-fA-F]{6})", c)  # gradient 등 문자열 속 첫 hex 추출
    if m:
        return "#" + m.group(1).lower()
    return None


def _get_chatbot_design_context(chatbot_id: str, db: Session) -> tuple[str, str]:
    """챗봇 테마에서 (primaryColor hex, 기관명 라벨) 로드. 실패 시 기본 파랑 + 빈 라벨."""
    primary = _DEFAULT_PRIMARY
    institution = ""
    try:
        from app.models.chatbot_settings import ChatbotSetting  # noqa: PLC0415

        row = db.execute(
            select(ChatbotSetting).where(ChatbotSetting.id == uuid.UUID(str(chatbot_id)))
        ).scalar_one_or_none()
        if row is not None:
            theme = row.theme if isinstance(row.theme, dict) else {}
            norm = _normalize_hex(theme.get("primaryColor") or theme.get("primary_color"))
            if norm:
                primary = norm
            institution = str(
                theme.get("widgetInstitutionName")
                or theme.get("widget_institution_name")
                or theme.get("widgetChatbotName")
                or row.name
                or ""
            ).strip()
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STAGING] design context load failed: %s", exc)
    return primary, institution


def _detect_contact(text: str) -> list[tuple[str, str]]:
    """원문 답변에 실제로 있는 연락처(전화·이메일)만 추출 — 하드코딩·창작 금지(테넌트 안전)."""
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for v in _CONTACT_PHONE_RE.findall(text):
        v = v.strip()
        if v and v not in seen:
            out.append(("📞", v))
            seen.add(v)
        if len(out) >= 2:
            break
    for v in _CONTACT_EMAIL_RE.findall(text):
        v = v.strip()
        if v and v not in seen:
            out.append(("✉️", v))
            seen.add(v)
            break
    return out[:4]


_FAQ_DESIGN_SYSTEM = (
    "당신은 공공기관 챗봇 FAQ 답변을 '디자인 카드'용 구조로 재구성하는 편집자입니다.\n"
    "질문과 답변을 받아 지정된 JSON 구조로만 출력합니다.\n"
    "절대 규칙:\n"
    "- 답변에 없는 사실·숫자·주장·연락처를 지어내지 마세요. 있는 내용만 재배치·정리합니다.\n"
    "- summary/items/table/note 텍스트는 원문 문장을 거의 그대로 사용하세요(가벼운 다듬기만).\n"
    "- 답변의 모든 핵심 내용이 summary·sections에 빠짐없이 담기게 하세요(내용 누락 금지).\n"
    "- 내용이 단순하면 sections·table을 비우고 summary만 채워도 됩니다.\n"
    "- table은 원문에 실제로 '비교/구분'되는 항목이 있을 때만. 없으면 null.\n"
    "- eyebrow/subtitle/heading/소제목은 짧은 디자인 라벨입니다(사실 주장이 아님).\n"
    "순수 JSON 객체 하나만 출력(코드블록·설명 금지)."
)


def _extract_faq_design(question: str, answer: str, db: Session) -> dict | None:
    """LLM으로 답변을 카드 구조(JSON)로 재배치. 실패 시 None."""
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return None
        user_prompt = (
            f"[질문]\n{question[:300]}\n\n[답변]\n{answer[:3500]}\n\n"
            "위 답변을 아래 JSON 형식으로 재구성하세요.\n"
            '{"icon":"주제를 상징하는 이모지 1개",'
            '"eyebrow":"짧은 분류 라벨(2~4어절)",'
            '"subtitle":"주제 부제 한 줄",'
            '"heading":"답변 핵심을 담은 짧은 제목(물음표 없이)",'
            '"summary":"핵심 답변 1~2문장(원문 기반)",'
            '"sections":[{"icon":"이모지","title":"소제목","items":["원문 문장","..."]}],'
            '"table":{"headers":["구분","A","B"],"rows":[["...","...","..."]]},'
            '"note":"부가 안내 한 줄"}\n'
            "해당 내용이 없으면 sections는 [], table·note는 null 로 두세요."
        )
        raw = _call_llm_raw(runtime_api, _FAQ_DESIGN_SYSTEM, user_prompt, max_tokens=1800, timeout=35)
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STAGING] faq design extract failed: %s", exc)
        return None


def _render_faq_card(
    *,
    icon: str,
    eyebrow: str,
    subtitle: str,
    pill: str,
    heading: str,
    summary: str,
    sections: list[dict],
    table: dict | None,
    note: str | None,
    contact: list[tuple[str, str]],
    primary: str,
) -> str:
    """구조(dict) + 테마색(primary hex) → 결정적 카드 HTML(위젯 sanitizer 허용 인라인 style)."""
    e = _html_escape
    p = primary  # #rrggbb — 뒤에 알파(hex) 붙여 반투명 배경 생성: {p}12, {p}2e 등
    out: list[str] = []
    out.append(
        '<div style="box-sizing:border-box;width:100%;max-width:860px;margin:0 auto 4px;'
        "padding:22px;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;"
        "box-shadow:0 12px 34px rgba(15,23,42,0.08);"
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',Arial,sans-serif;\">"
    )
    # 헤더: 아이콘 배지 + 라벨 + 기관 pill
    out.append(
        '<div style="display:flex;align-items:center;justify-content:space-between;'
        'gap:12px;flex-wrap:wrap;margin-bottom:16px;">'
        '<div style="display:flex;align-items:center;gap:12px;">'
        f'<div style="width:46px;height:46px;border-radius:15px;background:{p};color:#ffffff;'
        f'display:flex;align-items:center;justify-content:center;font-size:23px;'
        f'box-shadow:0 8px 18px {p}40;">{e(icon)}</div><div>'
    )
    if eyebrow:
        out.append(
            f'<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;'
            f'color:{p};font-weight:800;">{e(eyebrow)}</div>'
        )
    if subtitle:
        out.append(f'<div style="font-size:14px;color:#64748b;font-weight:700;">{e(subtitle)}</div>')
    out.append("</div></div>")
    if pill:
        out.append(
            f'<span style="display:inline-block;padding:7px 11px;border-radius:999px;'
            f'background:{p}12;color:{p};font-weight:800;font-size:12px;">{e(pill)}</span>'
        )
    out.append("</div>")
    # 제목
    if heading:
        out.append(
            f'<h3 style="margin:0 0 12px;font-size:21px;line-height:1.35;color:#0f172a;'
            f'font-weight:900;">{e(heading)}</h3>'
        )
    # 핵심 답변 박스
    if summary:
        out.append(
            f'<div style="padding:15px 17px;border-radius:16px;'
            f'background:linear-gradient(135deg,{p}12,#f8fafc);border:1px solid {p}2e;">'
            f'<div style="font-size:13px;color:{p};font-weight:900;margin-bottom:6px;">핵심 답변</div>'
            f'<p style="margin:0;font-size:15.5px;line-height:1.8;color:#1f2937;'
            f'font-weight:600;">{e(summary)}</p></div>'
        )
    # 특징/항목 카드 (체크리스트)
    for sec in sections:
        title = sec.get("title") or ""
        items = sec.get("items") or []
        sicon = sec.get("icon") or "•"
        if not items:
            continue
        out.append(
            '<div style="margin-top:14px;padding:15px 16px;border:1px solid #e2e8f0;'
            'border-radius:15px;background:#ffffff;">'
        )
        if title:
            out.append(
                f'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
                f'<span style="font-size:19px;">{e(sicon)}</span>'
                f'<strong style="font-size:15px;color:#0f172a;">{e(title)}</strong></div>'
            )
        out.append('<ul style="padding:0;margin:0;list-style:none;">')
        for it in items:
            out.append(
                f'<li style="display:flex;gap:10px;margin:8px 0;line-height:1.65;color:#334155;">'
                f'<span style="color:{p};font-weight:800;line-height:1.5;">✓</span>'
                f'<span>{e(it)}</span></li>'
            )
        out.append("</ul></div>")
    # 비교 표
    if table and table.get("headers") and table.get("rows"):
        th = "".join(
            f'<th style="padding:11px 13px;text-align:left;font-size:13px;color:#334155;'
            f'background:#f8fafc;border-bottom:1px solid #e2e8f0;">{e(str(h))}</th>'
            for h in table["headers"]
        )
        trs = []
        for row in table["rows"]:
            tds = "".join(
                f'<td style="padding:11px 13px;font-size:14px;line-height:1.65;color:#334155;'
                f'border-bottom:1px solid #e2e8f0;vertical-align:top;">{e(str(c))}</td>'
                for c in row
            )
            trs.append(f"<tr>{tds}</tr>")
        out.append(
            f'<div style="margin-top:14px;overflow-x:auto;border:1px solid #e2e8f0;'
            f'border-radius:14px;background:#ffffff;">'
            f'<table style="width:100%;border-collapse:collapse;min-width:480px;">'
            f'<thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>'
        )
    # 주석(callout)
    if note:
        out.append(
            f'<div style="margin-top:14px;padding:12px 14px;border-left:4px solid {p};'
            f'background:#f8fafc;border-radius:10px;color:#475569;font-size:13px;'
            f'line-height:1.65;">{e(note)}</div>'
        )
    # 연락처(원문에 있을 때만)
    if contact:
        pills = "".join(
            f'<span style="display:inline-flex;align-items:center;gap:6px;margin:4px 8px 4px 0;'
            f'padding:8px 10px;border-radius:999px;background:#fff;color:#334155;'
            f'border:1px solid #e2e8f0;font-size:13px;">{e(ic)} {e(tx)}</span>'
            for ic, tx in contact
        )
        out.append(
            f'<div style="margin-top:16px;padding:15px;border-radius:15px;'
            f'background:linear-gradient(135deg,{p}14,#ffffff);border:1px solid {p}33;">'
            f'<div style="font-weight:800;color:#0f172a;margin-bottom:8px;">문의 안내</div>'
            f"<div>{pills}</div></div>"
        )
    out.append("</div>")
    return "".join(out)


def _design_faq_answer_html(
    question: str, answer: str, db: Session, primary: str, institution: str
) -> str:
    """Q&A 답변 → 테마 반영 디자인 카드 HTML. 실패·가드 위반 시 원문 답변 그대로 반환."""
    text = (answer or "").strip()
    if len(text) < 40 or len(text) > 4000:
        return answer
    design = _extract_faq_design(question, text, db)
    if not design:
        return answer

    summary = str(design.get("summary") or "").strip()[:900]
    sections: list[dict] = []
    for sec in design.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        items = [str(x).strip()[:400] for x in (sec.get("items") or []) if str(x).strip()][:8]
        if not items:
            continue
        sections.append(
            {
                "icon": (str(sec.get("icon") or "").strip()[:4] or "•"),
                "title": str(sec.get("title") or "").strip()[:80],
                "items": items,
            }
        )
    table = None
    t = design.get("table")
    if isinstance(t, dict) and t.get("headers") and t.get("rows"):
        headers = [str(h).strip()[:60] for h in t["headers"] if str(h).strip()][:5]
        rows = []
        for r in t["rows"]:
            if isinstance(r, list):
                cells = [str(c).strip()[:200] for c in r][:5]
                if any(cells):
                    rows.append(cells)
        rows = rows[:12]
        if headers and rows:
            table = {"headers": headers, "rows": rows}
    note = str(design.get("note") or "").strip()[:300] or None

    if not summary and not sections:
        return answer  # 카드로 만들 최소 구조(요약/섹션)조차 없으면 원문 유지

    # 사실 보존 가드 — 내용 필드(디자인 라벨 제외)가 원문을 누락·변조하지 않았는지 검사.
    guard_bits = [summary]
    if note:
        guard_bits.append(note)
    for sec in sections:
        guard_bits.extend(sec["items"])
    if table:
        guard_bits.extend(table["headers"])
        for r in table["rows"]:
            guard_bits.extend(r)
    guard_text = " ".join(b for b in guard_bits if b)
    if not _preserves_facts(text, guard_text):
        logger.info("[STAGING] faq design rejected (facts changed) — keep original answer")
        return answer

    try:
        return _render_faq_card(
            icon=(str(design.get("icon") or "").strip()[:4] or "💬"),
            eyebrow=str(design.get("eyebrow") or "").strip()[:40],
            subtitle=str(design.get("subtitle") or "").strip()[:80],
            pill=(institution.strip()[:20] or "FAQ"),
            heading=str(design.get("heading") or "").strip()[:120],
            summary=summary,
            sections=sections,
            table=table,
            note=note,
            contact=_detect_contact(text),
            primary=primary,
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STAGING] faq card render failed: %s", exc)
        return answer


# ── 주제명 생성 ───────────────────────────────────────────────────────────────

def _rule_based_title(text: str) -> str:
    """헤딩처럼 보이는 줄을 찾거나, 없으면 명사구 중심으로 첫 줄 요약."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return "주제 없음"

    # 1. 헤딩 패턴 줄 우선
    for line in lines[:6]:
        cleaned = re.sub(r"^(?:[①-⑳⑴-⑽\d]+[\.\)]\s*|[□■▶◆●★]\s*)", "", line).strip()
        if 4 <= len(cleaned) <= 30:
            return cleaned

    # 2. 첫 줄에서 불필요한 접두사 제거 후 사용
    first = re.sub(r"^(?:#+\s*|[-•*]\s*|\d+\.\s*)", "", lines[0]).strip()
    if len(first) <= 30:
        return first
    # 문장 첫 절 추출
    m = re.search(r"[,\.\s·]{1}", first[10:40])
    if m:
        return first[: m.start() + 10].strip()
    return first[:25]


def _call_llm_raw(
    runtime_api: Any,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 800,
    timeout: int = 20,
    model: str | None = None,
) -> str:
    """LLM 공통 호출 헬퍼. 원시 텍스트 응답 반환.

    model 미지정 시 품질 우선 모델(quality_model) 사용.
    청크 분석처럼 대량·반복 호출에는 호출자가 speed_model()을 넘겨 지연을 줄인다.
    """
    model = model or runtime_api.quality_model()

    if runtime_api.provider == "anthropic":
        response_json = _call_anthropic(
            api_key=runtime_api.api_key,
            base_url=runtime_api.base_url,
            model=model,
            temperature=0.1,
            max_output_tokens=max_tokens,
            top_p=None,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            timeout_seconds=float(timeout),
        )
        return _extract_output_text_anthropic(response_json)

    response_json = _call_openai_like(
        provider=runtime_api.provider,
        api_key=runtime_api.api_key,
        base_url=runtime_api.base_url,
        model=model,
        temperature=0.1,
        max_output_tokens=max_tokens,
        top_p=None,
        frequency_penalty=None,
        presence_penalty=None,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=float(timeout),
    )
    return _extract_output_text_openai(response_json)


def _llm_analyze_chunk(
    text: str, db: Session, *, heading: str | None = None
) -> tuple[str, list[str], str]:
    """
    청크를 종합 분석:
    - title: 사용자가 실제로 물어볼 법한 질문 (heading이 범위를 고정한다)
    - tags: 구체적 키워드
    - content: PDF 아티팩트 제거 + 마크다운으로 정리된 내용

    실패 시 ('', [], '') 반환 → 호출자가 rule-based 폴백 처리.
    """
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return "", [], ""

        system_prompt = (
            "당신은 공공기관 챗봇 지식 데이터베이스 구축 전문가입니다.\n"
            "업로드된 문서의 섹션을 분석해 챗봇이 사용자 질문에 정확히 답할 수 있도록 정리합니다.\n"
            "반드시 순수 JSON만 출력하세요. 코드블록(```) 마크업이나 설명 문장을 JSON 앞뒤에 절대 붙이지 마세요."
        )
        heading_line = f"[섹션 제목]\n{heading}\n\n" if heading else ""
        user_prompt = (
            "다음 문서 섹션을 분석해 JSON으로 응답하세요:\n\n"
            f"{heading_line}"
            f"[원본 텍스트]\n{text[:2000]}\n\n"
            "응답 JSON 형식:\n"
            "{\n"
            '  "title": "이 섹션을 찾는 사용자가 입력할 법한 질문 한 문장",\n'
            '  "tags": ["키워드1", "키워드2", "키워드3"],\n'
            '  "content": "정리된 내용 (마크다운)"\n'
            "}\n\n"
            "=== title 규칙 (매우 중요) ===\n"
            "- 제목이 아니라 **질문**을 쓴다. 물음표로 끝낸다. 60자 이내.\n"
            "- 섹션 제목이 주어졌으면 그 범위 안에서 질문을 만든다 — 옆 섹션과\n"
            "  겹치는 일반적인 질문(예: '어떻게 신청하나요?')은 금지.\n"
            "- 섹션 제목의 번호·기호(1., □, 제2장)는 질문에 넣지 않는다.\n"
            "- 예: 섹션 제목 '1. 반입 절차' → '폐기물 반입 절차가 어떻게 되나요?'\n"
            "- 예: 섹션 제목 '□ 제출 서류' → '반입 신청 시 어떤 서류를 내야 하나요?'\n"
            "- 기관 담당자가 아니라 민원인의 말투로 쓴다.\n\n"
            "=== tags 규칙 ===\n"
            "- 원문에 직접 등장하는 명사·고유명사 위주 3~5개\n\n"
            "=== content 규칙 (매우 중요) ===\n"
            "1. PDF 변환 잔여물(페이지번호, 머리글/바닥글, 의미없는 줄바꿈) 제거\n"
            "2. 원본의 모든 수치·날짜·금액·조건·절차를 빠짐없이 보존\n"
            "3. 구조화 규칙:\n"
            "   - 대제목: ## 제목\n"
            "   - 소제목: ### 소제목\n"
            "   - 나열 항목: - 항목 (들여쓰기 없이 사용)\n"
            "   - 중요 단어: **굵게**\n"
            "4. 표(테이블) 형식 규칙 (반드시 준수):\n"
            "   - 원본에 표·격자·비교 데이터가 있으면 마크다운 테이블로 변환\n"
            "   - 형식: 헤더행 | 구분행(---) | 데이터행 순서로 작성\n"
            "   - 예시:\n"
            "     | 구분 | 내용 | 비고 |\n"
            "     |------|------|------|\n"
            "     | A | 내용1 | 비고1 |\n"
            "   - 셀 내용이 없으면 빈 문자열('')이 아닌 '-' 입력\n"
            "   - 표 앞뒤에 빈 줄 추가\n"
            "5. content 전체를 JSON 문자열로 직렬화할 때 줄바꿈은 \\n으로 이스케이프"
        )

        # 청크 분석은 대량 반복 호출 → 속도 우선 모델로 지연 최소화 (gpt-4o-mini / haiku)
        raw = _call_llm_raw(
            runtime_api, system_prompt, user_prompt,
            max_tokens=2000, timeout=30, model=runtime_api.speed_model(),
        )

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("[STAGING] LLM JSON not found in response: %s", raw[:100])
            return "", [], ""

        parsed = json.loads(m.group(0))
        # 질문 한 문장은 25자 제목보다 길다. 50자에서 자르면 물음표가 날아가
        # "폐기물 반입 절차가 어떻게 되" 같은 잘린 문장이 FAQ 질문이 된다.
        title = str(parsed.get("title") or "")[:80]
        tags = [str(t) for t in (parsed.get("tags") or [])][:5]
        content = str(parsed.get("content") or "").strip()
        return title, tags, content

    except Exception as exc:
        logger.warning("[STAGING] LLM chunk analysis failed: %s", exc)
        return "", [], ""


# ── AI 병합 ──────────────────────────────────────────────────────────────────

def _llm_merge_content(original: str, new_content: str, db: Session) -> str | None:
    """기존 내용과 신규 내용을 AI로 병합해 최신화된 단일 문서로 반환."""
    try:
        from app.services.llm_api_config_runtime_service import resolve_runtime_api_config  # noqa: PLC0415

        runtime_api = resolve_runtime_api_config(db)
        if runtime_api is None:
            return None

        system_prompt = (
            "당신은 공공기관 챗봇 지식 데이터베이스 관리 전문가입니다.\n"
            "기존 지식 문서와 새로 추가된 내용을 분석해 최신화된 단일 문서로 통합합니다.\n"
            "반드시 마크다운 형식으로만 답변하세요. 설명 문장을 앞에 붙이지 마세요."
        )
        user_prompt = (
            "아래 기존 문서와 신규 내용을 하나로 통합해주세요.\n\n"
            f"[기존 내용]\n{original[:1200]}\n\n"
            f"[신규 내용]\n{new_content[:1200]}\n\n"
            "규칙:\n"
            "- 중복 내용은 최신 버전으로 통합\n"
            "- 기존에 없던 새 정보는 추가\n"
            "- 기존 정보가 변경되었으면 수정\n"
            "- 불필요한 내용은 제거\n"
            "- 마크다운 형식으로 정리 (## 제목, ### 소제목, - 항목)\n"
            "- 통합된 최종 문서만 출력"
        )
        # 병합도 대량 반복 가능 → 속도 우선 모델로 지연 최소화
        return _call_llm_raw(
            runtime_api, system_prompt, user_prompt,
            max_tokens=1800, timeout=30, model=runtime_api.speed_model(),
        ) or None
    except Exception as exc:
        logger.debug("[STAGING] merge content failed: %s", exc)
        return None


# ── 병합 후보 검사 (기존 등록 주제 = FAQ 기준) ──────────────────────────────────

_MERGE_THRESHOLD = 0.88  # 주제명 임베딩 유사도 — 이 값 이상이면 기존 FAQ를 갱신(upsert)


def _find_faq_merge_candidate(
    topic_title: str,
    chatbot_id: str,
    db: Session,
) -> tuple[str | None, str | None, float | None, str | None]:
    """새 주제가 기존 등록 주제(FAQ)와 같으면 (질문, faq_id, score, 기존답변) 반환.

    기존엔 원본 RAG 문서(raw 전체텍스트)와 비교해 들쭉날쭉했으나,
    이제 정리본끼리(주제명 ↔ FAQ 질문 임베딩) 비교 → 일관적.
    매칭 시 등록 단계(register_staging_chunks)에서 새로 만들지 않고 해당 FAQ를 갱신한다.
    """
    try:
        from app.services.admin.faq_service import search_faq_by_question  # noqa: PLC0415

        if not topic_title.strip():
            return None, None, None, None

        match = search_faq_by_question(
            db, chatbot_id=chatbot_id, query=topic_title, threshold=_MERGE_THRESHOLD
        )
        if match:
            return match["question"], match["id"], match["score"], match["answer"]
    except Exception as exc:
        logger.debug("[STAGING] FAQ merge check skipped: %s", exc)

    return None, None, None, None


# ── 세션 생성 ─────────────────────────────────────────────────────────────────

def create_staging_session_immediate(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    source_type: str,
    source_name: str,
    is_duplicate_file: bool = False,
) -> KnowledgeStagingSession:
    """
    세션 레코드만 즉시 생성하고 반환 (status=analyzing).
    실제 분석은 analyze_staging_session_background()를 별도로 호출.
    """
    session_row = KnowledgeStagingSession(
        chatbot_id=uuid.UUID(chatbot_id),
        organization_id=uuid.UUID(organization_id),
        source_type=source_type,
        source_name=source_name,
        status="analyzing",
        total_chunks=0,
        is_duplicate_file=is_duplicate_file,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    logger.info("[STAGING] session created id=%s", session_row.id)
    return session_row


def _strip_heading_marker(heading: str) -> str:
    """헤딩에서 번호·기호 접두사를 뗀다.

    "1. 반입 절차" 가 FAQ 질문으로 그대로 들어가면 번호가 임베딩 노이즈가 되어
    시맨틱 매칭 점수를 떨어뜨린다. 내용어만 남긴다.
    번호를 떼면 남는 게 없는 경우(예: "1.")는 원본을 그대로 둔다.
    """
    stripped = _HEADING_MARKER_RE.sub("", heading.strip(), count=1).strip()
    return stripped or heading.strip()


def _section_title(section: DocumentSection, llm_title: str, rule_title: str) -> str:
    """추천 주제명. 사용자가 실제로 물어볼 법한 질문을 우선한다.

    LLM에게 헤딩을 함께 주고 질문을 만들게 한다 — 헤딩이 범위를 고정해 주므로
    인접 섹션끼리 같은 질문이 나오지 않는다. LLM이 실패하면 헤딩에서 번호만
    떼어 쓰고, 헤딩도 없으면 규칙 기반 제목으로 내려간다.
    """
    question = llm_title.strip()
    if question:
        # 조각별 내용으로 만든 질문은 서로 다르므로 (1/3) 꼬리표가 필요 없다.
        return question
    if not section.heading:
        return rule_title
    base = _strip_heading_marker(section.heading)
    # 폴백은 조각마다 같은 제목이 되므로 구분자를 붙인다.
    if section.part_count > 1:
        return f"{base} ({section.part}/{section.part_count})"
    return base


def _analyze_one_chunk(sort_order: int, section: DocumentSection, chatbot_id: str) -> dict:
    """단일 청크 분석(주제/태그/정리 + PII + FAQ 병합 검사).

    스레드 풀에서 병렬 실행되며 **스레드별 독립 DB 세션**을 쓴다(SQLAlchemy 세션은
    스레드 안전하지 않음). DB 쓰기는 하지 않고 결과 dict만 반환 → 호출자가 메인
    세션에서 순서대로 저장. 실패해도 규칙기반 폴백 dict 반환(한 청크 실패가 전체를
    막지 않음).
    """
    from app.db import SessionLocal  # noqa: PLC0415

    chunk_text = section.text
    tdb = SessionLocal()
    try:
        llm_title, llm_tags, llm_content = _llm_analyze_chunk(
            chunk_text, tdb, heading=section.heading
        )
        topic_title = _section_title(section, llm_title, _rule_based_title(chunk_text))
        final_content = llm_content if llm_content else chunk_text
        pii_found, pii_regions = detect_pii(final_content)

        merge_title, merge_id, merge_score, existing_answer = _find_faq_merge_candidate(
            topic_title, chatbot_id, tdb
        )
        registration_type = "merge" if merge_id else "new"
        merge_original_content: str | None = None
        if registration_type == "merge" and existing_answer:
            merge_original_content = existing_answer
            merged = _llm_merge_content(existing_answer, final_content, tdb)
            if merged:
                final_content = merged
                pii_found, pii_regions = detect_pii(final_content)

        return {
            "topic_title": topic_title,
            "content": final_content,
            "tags": llm_tags,
            "pii_detected": pii_found,
            "pii_regions": pii_regions,
            "merge_candidate_title": merge_title,
            "merge_candidate_id": merge_id,
            "merge_score": merge_score,
            "merge_original_content": merge_original_content,
            "registration_type": registration_type,
            "sort_order": sort_order,
            "category": section.category,
            "field": section.field,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "[STAGING] chunk analysis failed order=%d: %s (rule-based fallback)", sort_order, exc
        )
        pii_found, pii_regions = detect_pii(chunk_text)
        return {
            "topic_title": _section_title(section, "", _rule_based_title(chunk_text)),
            "content": chunk_text,
            "tags": [],
            "pii_detected": pii_found,
            "pii_regions": pii_regions,
            "merge_candidate_title": None,
            "merge_candidate_id": None,
            "merge_score": None,
            "merge_original_content": None,
            "registration_type": "new",
            "sort_order": sort_order,
            "category": section.category,
            "field": section.field,
        }
    finally:
        tdb.close()


def analyze_staging_session_background(
    session_id: str,
    text: str,
    chatbot_id: str,
    organization_id: str,
) -> None:
    """
    백그라운드 태스크로 실행: 청킹 → (병렬) LLM 주제명·PII·병합 검사 → 순차 저장.
    독립 DB 세션 사용 (FastAPI BackgroundTasks는 요청 세션과 분리).
    청크별 LLM 분석은 ThreadPoolExecutor로 병렬화(각 스레드 독립 세션), 저장은 메인 세션.
    """
    from app.db import SessionLocal  # noqa: PLC0415

    db = SessionLocal()
    try:
        session_row = db.execute(
            select(KnowledgeStagingSession).where(
                KnowledgeStagingSession.id == uuid.UUID(session_id)
            )
        ).scalar_one_or_none()
        if session_row is None:
            logger.warning("[STAGING] session not found id=%s", session_id)
            return

        # 재분석(reanalyze)에서 재사용하도록 원본 텍스트 보관
        session_row.extracted_text = text
        # ① 문서 유형 판별(2계층) — 공통 경로가 망가뜨리는 문서만 따로 다룬다.
        #    관리자가 유형을 바꿔 재분석한 경우 그 선택이 자동 판별을 이긴다.
        verdict = detect_document_type(text)
        session_row.detected_doc_type = verdict.doc_type.value
        session_row.doc_type_reason = verdict.reason[:300] or None
        effective_type = (
            DocType(session_row.admin_doc_type)
            if session_row.admin_doc_type
            else verdict.doc_type
        )
        logger.info(
            "[STAGING] doc_type id=%s detected=%s admin=%s effective=%s reason=%s",
            session_id, verdict.doc_type.value, session_row.admin_doc_type,
            effective_type.value, verdict.reason,
        )

        # 빈 서식·신청서는 라벨과 빈 칸뿐이라 지식이 되지 않는다. 공통 경로에 넣으면
        # "성명 주소 연락처"가 FAQ 주제로 등록되고 관리자가 전부 지워야 한다.
        if effective_type is DocType.FORM:
            session_row.total_chunks = 0
            session_row.status = "ready"
            db.commit()
            logger.info("[STAGING] form skipped id=%s reason=%s", session_id, verdict.reason)
            return

        # Q&A 문서는 LLM 재작성 없이 원문 그대로 추출한다.
        # (일반 문서용 주제추출·재작성이 Q&A를 쪼개고 답변을 날조하던 문제 회피)
        qa_pairs = _parse_qa_pairs(text) if effective_type is DocType.QA else None
        results: list[dict | None]
        if qa_pairs:
            # PDF 평탄화로 생긴 단어중간 공백 교정(가드 있음) 후 재파싱 — 내용은 그대로.
            cleaned_text = _despace_pdf_text(text, db)
            qa_pairs = _parse_qa_pairs(cleaned_text) or qa_pairs
            # 간결 대표질문(제목=매칭질문) + 분류·태그 자동 부여 (답변 원문은 유지).
            enrichments = _enrich_qa_pairs(qa_pairs, db)
            session_row.total_chunks = len(qa_pairs)
            db.flush()
            results = []
            for i, (_question, answer) in enumerate(qa_pairs):
                enr = enrichments[i] if i < len(enrichments) else {"title": _question, "tags": []}
                try:
                    # 답변을 마크다운으로 자동 서식화(사실 보존 가드) → 위젯이 표·목록·굵게 렌더.
                    formatted_answer = _format_faq_answer(answer, db)
                    results.append(
                        _build_qa_staging_result(
                            i, enr["title"], formatted_answer, chatbot_id, db, tags=enr["tags"]
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[STAGING] qa pair build failed order=%d: %s", i, exc)
            logger.info(
                "[STAGING] qa-format detected id=%s pairs=%d (concise title + tags, answer verbatim)",
                session_id, len(qa_pairs),
            )
        else:
            # ② 일반 문서 — 단락 청킹 + 청크별 LLM 분석(병렬, 각 스레드 독립 세션).
            raw_chunks = _split_semantic_chunks(text)
            session_row.total_chunks = len(raw_chunks)
            db.flush()
            results = [None] * len(raw_chunks)
            if raw_chunks:
                max_workers = min(_ANALYZE_CONCURRENCY, len(raw_chunks))
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = {
                        executor.submit(_analyze_one_chunk, i, section, chatbot_id): i
                        for i, section in enumerate(raw_chunks)
                    }
                    for fut in as_completed(futures):
                        idx = futures[fut]
                        results[idx] = fut.result()

        for res in results:
            if res is None:
                continue
            db.add(
                KnowledgeStagingChunk(
                    session_id=session_row.id,
                    topic_title=res["topic_title"],
                    content=res["content"],
                    tags=res["tags"],
                    pii_detected=res["pii_detected"],
                    pii_regions=res["pii_regions"],
                    merge_candidate_title=res["merge_candidate_title"],
                    merge_candidate_id=res["merge_candidate_id"],
                    merge_score=res["merge_score"],
                    merge_original_content=res["merge_original_content"],
                    registration_type=res["registration_type"],
                    status="pending",
                    sort_order=res["sort_order"],
                    # Q&A 경로(_build_qa_staging_result)는 계층이 없어 키가 빠진다.
                    category=res.get("category"),
                    field=res.get("field"),
                )
            )

        session_row.status = "ready"
        db.commit()
        logger.info(
            "[STAGING] analysis done id=%s chunks=%d",
            session_id, session_row.total_chunks or 0,
        )

    except Exception as exc:
        logger.error("[STAGING] analysis failed id=%s: %s", session_id, exc)
        try:
            session_row = db.execute(
                select(KnowledgeStagingSession).where(
                    KnowledgeStagingSession.id == uuid.UUID(session_id)
                )
            ).scalar_one_or_none()
            if session_row:
                session_row.status = "failed"
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


def create_staging_session(
    db: Session,
    *,
    chatbot_id: str,
    organization_id: str,
    text: str,
    source_type: str,
    source_name: str,
) -> KnowledgeStagingSession:
    """하위 호환 래퍼 — 동기로 전체 처리 (소량 텍스트용)."""
    session_row = create_staging_session_immediate(
        db,
        chatbot_id=chatbot_id,
        organization_id=organization_id,
        source_type=source_type,
        source_name=source_name,
    )
    analyze_staging_session_background(
        session_id=str(session_row.id),
        text=text,
        chatbot_id=chatbot_id,
        organization_id=organization_id,
    )
    db.refresh(session_row)
    return session_row


# ── 청크 등록 ─────────────────────────────────────────────────────────────────

def register_staging_chunks(
    db: Session,
    *,
    session_id: str,
    chatbot_id: str,
    chunk_ids: list[str] | None = None,
) -> dict[str, int]:
    """선택된 스테이징 청크를 FAQ + RAG 지식으로 동시 등록.

    각 청크는:
    1. FAQ 항목으로 생성 (topic_title = question, content = answer, 임베딩 자동)
    2. RAG 텍스트 지식으로도 색인 (기존 검색 파이프라인 유지)

    chunk_ids=None 이면 pending 상태 전체 등록.
    """
    from app.services.admin.knowledge_service import create_text_knowledge_internal  # noqa: PLC0415
    from app.services.admin.faq_service import create_faq_item, update_faq_item  # noqa: PLC0415

    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id)
        )
    ).scalar_one_or_none()

    if session_row is None:
        raise ValueError("STAGING_SESSION_NOT_FOUND")

    stmt = (
        select(KnowledgeStagingChunk)
        .where(
            KnowledgeStagingChunk.session_id == session_row.id,
            KnowledgeStagingChunk.status == "pending",
        )
        .order_by(KnowledgeStagingChunk.sort_order)
    )
    if chunk_ids:
        stmt = stmt.where(
            KnowledgeStagingChunk.id.in_([uuid.UUID(cid) for cid in chunk_ids])
        )

    chunks = list(db.execute(stmt).scalars().all())
    registered = 0

    # 파일 업로드 세션은 RAG를 업로드 시점에 즉시 처리했으므로 등록 시 FAQ만 생성.
    # + Q&A 형식(질의응답) 세션은 각 쌍을 FAQ로만 등록하고 청크별 RAG 색인은 생략한다
    #   (질문이 파일·텍스트 탭에 중복 등록되는 문제 방지 — 원문 전체는 이미 색인/FAQ로 커버).
    skip_rag = session_row.source_type == "file"
    is_qa_session = bool(
        session_row.extracted_text and _parse_qa_pairs(session_row.extracted_text)
    )
    if is_qa_session:
        skip_rag = True
        logger.info("[STAGING] qa-format session %s → FAQ only (skip per-chunk RAG)", session_id)

    # Q&A 세션: 각 답변을 기관 테마 색상이 반영된 디자인 카드(HTML)로 변환 → FAQ 답변.
    #   등록 지연을 줄이기 위해 청크별 LLM 디자인 호출을 병렬 선처리(각 스레드 독립 세션).
    #   가드 실패 시 원문 답변 그대로 → design_map엔 항상 유효한 답변이 담긴다.
    design_map: dict[uuid.UUID, str] = {}
    if is_qa_session and chunks:
        primary, institution = _get_chatbot_design_context(chatbot_id, db)

        def _design_worker(topic: str, content: str) -> str:
            from app.db import SessionLocal  # noqa: PLC0415

            with SessionLocal() as d_db:
                return _design_faq_answer_html(topic, content, d_db, primary, institution)

        with ThreadPoolExecutor(max_workers=min(4, len(chunks))) as ex:
            futs = {ex.submit(_design_worker, c.topic_title, c.content): c.id for c in chunks}
            for fut in as_completed(futs):
                cid = futs[fut]
                try:
                    design_map[cid] = fut.result()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[STAGING] faq design worker failed chunk=%s: %s", cid, exc)
        logger.info(
            "[STAGING] faq design generated session=%s chunks=%d designed=%d",
            session_id, len(chunks), sum(1 for v in design_map.values() if "<div" in v),
        )

    for chunk in chunks:
        faq_answer = design_map.get(chunk.id, chunk.content)
        chunk_id_str = str(chunk.id)
        chunk_tags = list(chunk.tags or [])
        # 병합 후보(기존 FAQ와 동일 주제)면 새로 만들지 않고 기존 FAQ를 갱신(upsert)
        is_merge = chunk.registration_type == "merge" and bool(chunk.merge_candidate_id)
        # ① FAQ 등록/갱신 — 별도 세션으로 격리 (각 커밋이 메인 세션에 영향 없음)
        faq_ok = False
        try:
            from app.db import SessionLocal  # noqa: PLC0415
            with SessionLocal() as faq_db:
                updated = None
                if is_merge:
                    updated = update_faq_item(
                        faq_db,
                        faq_id=chunk.merge_candidate_id,
                        organization_id=str(session_row.organization_id),
                        answer=faq_answer,
                        tags=chunk_tags or None,
                    )
                    if updated is not None:
                        logger.info("[STAGING] FAQ updated (merge) faq=%s chunk=%s", chunk.merge_candidate_id, chunk_id_str)
                # 신규이거나, 갱신 대상 FAQ가 사라진 경우 → 새로 생성
                if updated is None:
                    create_faq_item(
                        faq_db,
                        chatbot_id=str(session_row.chatbot_id),
                        organization_id=str(session_row.organization_id),
                        question=chunk.topic_title,
                        answer=faq_answer,
                        tags=chunk_tags,
                        source_staging_session_id=session_id,
                        # 문서 헤딩 계층이 있으면 그쪽이 정확하다. 계층이 없는
                        # 문서와 이 컬럼 도입 전 행은 예전처럼 태그로 폴백한다.
                        category=chunk.category or (chunk_tags[0] if chunk_tags else None),
                        field=chunk.field or (chunk_tags[1] if len(chunk_tags) > 1 else None),
                    )
            faq_ok = True
        except Exception as exc:
            logger.warning("[STAGING] FAQ register failed chunk=%s: %s", chunk_id_str, exc)

        # ② RAG 색인 — 텍스트 입력 세션 + 신규 주제에서만 수행
        #    (파일은 업로드 시점에 이미 처리, merge는 기존 지식이 이미 색인돼 있어 중복 방지)
        if faq_ok and not skip_rag and not is_merge:
            try:
                create_text_knowledge_internal(
                    db,
                    chatbot_id=str(session_row.chatbot_id),
                    organization_id=str(session_row.organization_id),
                    title=chunk.topic_title,
                    content=chunk.content,
                    tags=chunk_tags,
                )
            except Exception as rag_exc:
                logger.warning("[STAGING] RAG indexing failed chunk=%s: %s (FAQ still registered)", chunk_id_str, rag_exc)

        if faq_ok:
            chunk.status = "registered"
            registered += 1
        else:
            chunk.status = "failed"

    # autoflush=False 세션이므로 SELECT 전 명시적 flush
    db.flush()
    if all(c.status != "pending" for c in db.execute(
        select(KnowledgeStagingChunk).where(
            KnowledgeStagingChunk.session_id == session_row.id
        )
    ).scalars().all()):
        session_row.status = "completed"

    db.commit()
    return {"registered": registered, "total": len(chunks)}

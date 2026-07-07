"""서울노동권익센터 온라인 상담게시판 수집기 (기관 전용).

서울노동포털(seoullabor.or.kr) 노동자/사용자 상담게시판의 '상담완료' 건에서
질문·전문가 답변을 수집한다. 로그인은 불필요하며, Spring Security CSRF 토큰만
있으면 상세가 열린다:
  1) 목록 GET → 세션 쿠키 + <meta name="_csrf"> 토큰 획득
  2) 목록 POST(currentPage=N) → 행에서 접수번호·제목·상태·날짜 파싱
  3) 상세 POST(rcept_no + _csrf param + X-CSRF-TOKEN header) → 질문·답변 파싱
  4) detect_and_mask_privacy로 비식별화

※ 특정 기관 전용(범용 아님). 상담 내용은 제3자 개인정보이므로, 기관의 데이터
  활용 권한 확인 + 답변/일반화 질문 중심 + 식별정보 마스킹을 전제로 사용.
"""

from __future__ import annotations

import logging
import os
import re
import ssl
import time
from dataclasses import dataclass

import httpx

from app.services.chat.privacy_guard_service import detect_and_mask_privacy

logger = logging.getLogger(__name__)

BASE_URL = "https://www.seoullabor.or.kr"
BOARDS: dict[str, dict[str, str]] = {
    "worker": {
        "list": "/portal/cnsltWorker/selectPageListCnsltWorker.do",
        "detail": "/portal/cnsltWorker/selectCnsltWorker.do",
        "label": "노동자상담",
        # 상세 POST 시 접수번호를 담는 파라미터명 (게시판마다 다름)
        "detail_param": "rcept_no",
    },
    "employer": {
        "list": "/portal/cnsltEmplyr/selectPageListCnsltEmplyr.do",
        "detail": "/portal/cnsltEmplyr/selectCnsltEmplyr.do",
        "label": "사용자상담",
        # 사용자 게시판은 rcept_no가 아니라 cnslt_emplyr_seq로 보내야 상세가 채워짐.
        "detail_param": "cnslt_emplyr_seq",
    },
}
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_MAX_ITEMS_HARD = 500
# 서버 부담 방지: 상세/목록 요청 사이 지연(초). 대량 수집 시 예의·차단 방지용.
# 프리뷰(소량)는 request_delay=0.0으로 빠르게 유지.
_REQUEST_DELAY_SECONDS = float(os.getenv("SEOUL_LABOR_REQUEST_DELAY", "0.6"))

_CSRF_RE = re.compile(r'<meta\s+name="_csrf"\s+content="([^"]+)"')
_ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S | re.I)
_FNDETAIL_RE = re.compile(r"fnDetail\('([^']+)'\)")
_SUBJECT_RE = re.compile(r"fnDetail\([^)]*\)[^>]*>\s*(?:<span[^>]*>)?(.*?)(?:</span>)?\s*</a>", re.S)
_STATUS_RE = re.compile(r'class="st[^"]*"[^>]*>\s*([^<]+?)\s*<')
_DATE_RE = re.compile(r"(\d{4}\.\d{2}\.\d{2})")
_DONE_STATUSES = {"완료", "상담완료"}


@dataclass
class Consultation:
    rcept_no: str
    title: str
    category: str
    question: str
    answer: str
    date: str
    masked_types: list[str]


def _make_client() -> httpx.Client:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return httpx.Client(
        verify=ctx,
        follow_redirects=True,
        timeout=httpx.Timeout(connect=5.0, read=20.0, write=10.0, pool=5.0),
        headers={"User-Agent": _UA, "Accept-Language": "ko-KR,ko;q=0.9"},
    )


def _open_session(client: httpx.Client, board: str) -> str:
    """목록 GET → 세션 쿠키 확립 + CSRF 토큰 반환."""
    resp = client.get(BASE_URL + BOARDS[board]["list"])
    match = _CSRF_RE.search(resp.text)
    if not match:
        raise ValueError("CSRF 토큰을 찾지 못했습니다 (사이트 구조 변경 가능성)")
    return match.group(1)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"(?s)<[^>]+>", " ", text)).strip()


def parse_list_items(html: str) -> list[dict[str, str]]:
    """목록 HTML → [{rceptNo, title, status, date}]."""
    items: list[dict[str, str]] = []
    for row in _ROW_RE.findall(html):
        id_match = _FNDETAIL_RE.search(row)
        if not id_match:
            continue
        subject = _SUBJECT_RE.search(row)
        status = _STATUS_RE.search(row)
        date = _DATE_RE.search(row)
        items.append(
            {
                "rceptNo": id_match.group(1),
                "title": _clean(subject.group(1)) if subject else "",
                "status": _clean(status.group(1)) if status else "",
                "date": date.group(1) if date else "",
            }
        )
    return items


def parse_detail(html: str) -> dict[str, str]:
    """상세 HTML → {category, question, answer}. 마커 기반(기관 전용 구조)."""
    marker = html.find("consulting_detail")
    seg = html[marker:] if marker >= 0 else html
    seg = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", "", seg)
    lines = [ln for ln in (_clean(x) for x in re.split(r"</?(?:tr|td|th|p|br|div|li)[^>]*>", seg)) if ln]

    def find_idx(keyword: str, start: int = 0) -> int:
        for i in range(start, len(lines)):
            if keyword in lines[i] and "수록된 표" not in lines[i]:
                return i
        return -1

    category = ""
    ci = find_idx("상담유형")
    if ci >= 0 and ci + 1 < len(lines):
        category = lines[ci + 1]

    # 질문: 상담유형 값 다음 ~ "목록"(질문/답변 구분 버튼) 전.
    # (질문 본문에 "답변"이란 단어가 들어갈 수 있어 "목록"만 구분자로 사용)
    q_start = ci + 2 if ci >= 0 else 0
    list_idx = find_idx("목록", q_start)
    q_end = list_idx if list_idx >= 0 else len(lines)
    question = "\n".join(lines[q_start:q_end]).strip()

    # 답변: "센터명" 라벨(목록 뒤) 다음 등록일 값 이후 ~ 안내 footer 전
    answer = ""
    center_idx = find_idx("센터명", q_end if q_end >= 0 else 0)
    if center_idx >= 0:
        a_start = center_idx + 1
        for i in range(center_idx + 1, min(center_idx + 8, len(lines))):
            if _DATE_RE.search(lines[i]):
                a_start = i + 1
                break
        a_end = len(lines)
        for stop in ("더 궁금", "상담전화", "상담시간"):
            idx = find_idx(stop, a_start)
            if idx >= 0:
                a_end = min(a_end, idx)
        answer = "\n".join(lines[a_start:a_end]).strip()

    return {"category": category, "question": question, "answer": answer}


def _fetch_list_page(client: httpx.Client, board: str, csrf: str, page: int) -> list[dict[str, str]]:
    resp = client.post(
        BASE_URL + BOARDS[board]["list"],
        data={"currentPage": str(page), "_csrf": csrf},
        headers={"X-CSRF-TOKEN": csrf, "Referer": BASE_URL + BOARDS[board]["list"]},
    )
    return parse_list_items(resp.text)


def _fetch_detail(client: httpx.Client, board: str, csrf: str, rcept_no: str) -> dict[str, str]:
    # 게시판마다 상세 파라미터명이 다름(worker=rcept_no, employer=cnslt_emplyr_seq).
    detail_param = BOARDS[board].get("detail_param", "rcept_no")
    resp = client.post(
        BASE_URL + BOARDS[board]["detail"],
        data={detail_param: rcept_no, "currentPage": "1", "_csrf": csrf},
        headers={"X-CSRF-TOKEN": csrf, "Referer": BASE_URL + BOARDS[board]["list"]},
    )
    return parse_detail(resp.text)


def collect_consultations(
    board: str,
    *,
    max_pages: int = 3,
    max_items: int = 50,
    request_delay: float | None = None,
) -> list[Consultation]:
    """상담완료 건을 수집·비식별화해 반환. 실패 항목은 건너뜀.

    request_delay: 요청 사이 지연(초). None이면 _REQUEST_DELAY_SECONDS 사용.
    대량 수집은 기본 지연으로 서버 부담을 낮추고, 프리뷰는 0.0으로 빠르게.
    """
    if board not in BOARDS:
        raise ValueError(f"알 수 없는 게시판: {board}")
    max_items = max(1, min(max_items, _MAX_ITEMS_HARD))
    delay = _REQUEST_DELAY_SECONDS if request_delay is None else max(0.0, request_delay)
    results: list[Consultation] = []
    with _make_client() as client:
        csrf = _open_session(client, board)
        for page in range(1, max_pages + 1):
            if len(results) >= max_items:
                break
            if page > 1 and delay:
                time.sleep(delay)
            try:
                rows = _fetch_list_page(client, board, csrf, page)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[SEOUL_LABOR] list page %s failed: %s", page, exc)
                break
            if not rows:
                break
            for row in rows:
                if len(results) >= max_items:
                    break
                if row["status"] not in _DONE_STATUSES:
                    continue
                try:
                    detail = _fetch_detail(client, board, csrf, row["rceptNo"])
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[SEOUL_LABOR] detail %s failed: %s", row["rceptNo"], exc)
                    continue
                finally:
                    if delay:
                        time.sleep(delay)
                if not detail["answer"]:
                    continue
                mq = detect_and_mask_privacy(detail["question"])
                ma = detect_and_mask_privacy(detail["answer"])
                results.append(
                    Consultation(
                        rcept_no=row["rceptNo"],
                        title=row["title"],
                        category=detail["category"],
                        question=mq.masked_text,
                        answer=ma.masked_text,
                        date=row["date"],
                        masked_types=sorted(set(mq.types + ma.types)),
                    )
                )
    logger.info("[SEOUL_LABOR] collected board=%s items=%s", board, len(results))
    return results


def preview_consultations(board: str, limit: int = 5) -> list[dict[str, str]]:
    """색인 전 확인용: 상담완료 앞 N건의 제목·상담유형·질문/답변 요약(비식별화)."""
    items = collect_consultations(
        board, max_pages=1, max_items=max(1, min(limit, 10)), request_delay=0.0
    )
    preview: list[dict[str, str]] = []
    for it in items[:limit]:
        preview.append(
            {
                "title": it.title,
                "category": it.category,
                "questionPreview": (it.question[:160] + "…") if len(it.question) > 160 else it.question,
                "answerPreview": (it.answer[:160] + "…") if len(it.answer) > 160 else it.answer,
                "maskedTypes": ", ".join(it.masked_types),
            }
        )
    return preview


def build_source_text(board: str, items: list[Consultation]) -> tuple[str, list[str]]:
    """수집한 상담을 웹 크롤과 동일한 [URL]-마킹 텍스트로 변환(색인 재사용)."""
    list_url = BASE_URL + BOARDS.get(board, BOARDS["worker"])["list"]
    blocks: list[str] = []
    urls: list[str] = []
    for it in items:
        marker_url = f"{list_url}#{it.rcept_no}"
        urls.append(marker_url)
        lines = [
            f"[URL] {marker_url}",
            f"[FINAL_URL] {marker_url}",
            f"[TITLE] {it.title}",
        ]
        # 상담유형(카테고리)을 별도 마커로 — 청크 메타에 저장돼 주제 분류/부스트/표시에 쓰임.
        if it.category:
            lines.append(f"[CATEGORY] {it.category}")
        lines += [
            "[EXTRACTION_METHOD] seoul_labor",
            "[NAVIGATION_REMOVED] false",
            f"[질문] {it.question}",
            f"[답변] {it.answer}",
        ]
        blocks.append("\n".join(lines).strip())
    return "\n\n".join(blocks).strip(), urls

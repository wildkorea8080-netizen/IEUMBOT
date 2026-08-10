"""긴 스캔본 PDF의 Vision 추출이 전 페이지를 순서대로 읽는지 검증.

배경: Vision 추출이 `max_pages=20` 고정이라 48쪽 사례집의 21쪽 이후가 통째로
버려졌다. 앞 20쪽은 대개 일러두기·목차라, FAQ 자동생성이 목차만 보고 주제를
뽑아 중복·잘림이 발생했다. 캡을 올리면서 메모리 때문에 배치 렌더링으로 바꿨고,
배치 오프셋이 틀리면 페이지 번호가 조용히 어긋나므로 순서를 함께 고정한다.
"""

import sys
import types

import pytest
from app.services.admin import knowledge_service as ks

TOTAL_PAGES = 25


class _FakeImage:
    def __init__(self, page_number: int) -> None:
        self.page_number = page_number

    def save(self, buf, format: str) -> None:  # noqa: A002 - PIL 시그니처 유지
        buf.write(f"page-{self.page_number}".encode())


class _FakePdfPage:
    pass


class _FakePdfReader:
    def __init__(self, _stream) -> None:
        self.pages = [_FakePdfPage() for _ in range(TOTAL_PAGES)]


@pytest.fixture
def vision_env(monkeypatch):
    """pdf2image / pypdf / LLM 클라이언트를 대체하고 렌더 호출을 기록한다."""
    render_calls: list[tuple[int, int]] = []

    def fake_convert_from_bytes(_data, *, first_page=1, last_page=None, **_kwargs):
        last = last_page or TOTAL_PAGES
        render_calls.append((first_page, last))
        return [_FakeImage(p) for p in range(first_page, last + 1)]

    monkeypatch.setitem(
        sys.modules,
        "pdf2image",
        types.SimpleNamespace(convert_from_bytes=fake_convert_from_bytes),
    )
    monkeypatch.setitem(sys.modules, "pypdf", types.SimpleNamespace(PdfReader=_FakePdfReader))

    from app.services import llm_api_config_runtime_service as runtime_module

    monkeypatch.setattr(
        runtime_module,
        "resolve_runtime_api_config",
        lambda _db: types.SimpleNamespace(provider="openai", api_key="sk-test", base_url=None),
    )

    class _FakeCompletions:
        def create(self, **kwargs):
            # 프롬프트에 실린 이미지 데이터에서 페이지 번호를 되읽어 응답을 만든다.
            content = kwargs["messages"][0]["content"]
            b64 = content[0]["image_url"]["url"].split(",", 1)[1]

            import base64

            marker = base64.b64decode(b64).decode()
            message = types.SimpleNamespace(content=f"본문 {marker}")
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)])

    class _FakeClient:
        chat = types.SimpleNamespace(completions=_FakeCompletions())

        def with_options(self, **_kwargs):
            return self

    from app.services.chat import answer_generation_service as answer_module

    monkeypatch.setattr(answer_module, "_build_openai_client", lambda *_a, **_k: _FakeClient())

    return render_calls


def test_vision_reads_every_page_in_order(vision_env, monkeypatch) -> None:
    monkeypatch.setattr(ks, "_VISION_RENDER_BATCH_PAGES", 10)

    text = ks._extract_pdf_text_via_vision(b"%PDF-fake", db=object())

    headers = [line for line in text.splitlines() if line.startswith("[페이지 ")]
    assert headers == [f"[페이지 {p}]" for p in range(1, TOTAL_PAGES + 1)]
    # 배치 오프셋이 어긋나면 헤더 번호와 본문 페이지가 엇갈린다.
    assert "[페이지 21]\n본문 page-21" in text


def test_vision_renders_in_bounded_batches(vision_env, monkeypatch) -> None:
    monkeypatch.setattr(ks, "_VISION_RENDER_BATCH_PAGES", 10)

    ks._extract_pdf_text_via_vision(b"%PDF-fake", db=object())

    # 전 페이지를 한 번에 들고 있지 않아야 메모리가 페이지 수에 비례해 늘지 않는다.
    assert vision_env == [(1, 10), (11, 20), (21, 25)]


def test_vision_respects_page_cap(vision_env, monkeypatch) -> None:
    monkeypatch.setattr(ks, "_VISION_RENDER_BATCH_PAGES", 10)

    text = ks._extract_pdf_text_via_vision(b"%PDF-fake", db=object(), max_pages=12)

    assert vision_env == [(1, 10), (11, 12)]
    assert "[페이지 12]" in text
    assert "[페이지 13]" not in text

"""인용 칩에 HTML 엔티티가 그대로 노출되지 않는다.

위젯 '참고한 자료' 칩에 이렇게 떴다.

    &quot;이동노동자쉼터&quot; 로 ...

HTMLParser 는 엔티티를 한 겹 풀어 주지만, 원본이 &amp;quot; 로 이중
인코딩돼 있으면 &quot; 가 그대로 남아 저장된다. 공공기관 CMS 에서 흔하다.
"""

from app.services.chat.citation_service import assemble_citations


def _candidate(**kw):
    base = {
        "documentId": "doc-1",
        "documentName": "문서",
        "documentVersionId": "ver-1",
        "chunkId": "chunk-1",
        "sectionTitle": "섹션",
        "sourceType": "website",
        "sourceUrl": "https://example.or.kr/a",
        "combinedScore": 0.5,
    }
    base.update(kw)
    return base


def _names(candidates):
    return [
        c["documentName"]
        for c in assemble_citations(candidates=candidates, citation_display_mode="visible")
    ]


def test_따옴표_엔티티가_글자로_바뀐다():
    result = _names([_candidate(documentName="&quot;이동노동자쉼터&quot; 로 검색한 결과")])

    assert result == ['"이동노동자쉼터" 로 검색한 결과']


def test_이중_인코딩도_풀린다():
    """&amp;quot; → &quot; → " 까지 두 겹."""
    result = _names([_candidate(documentName="&amp;quot;쉼터&amp;quot;")])

    assert result == ['"쉼터"']


def test_흔한_엔티티들을_처리한다():
    result = _names(
        [
            _candidate(documentName="A &amp; B", sourceUrl="https://example.or.kr/1"),
            _candidate(documentName="공지&nbsp;사항", sourceUrl="https://example.or.kr/2"),
            _candidate(documentName="&lt;안내&gt;", sourceUrl="https://example.or.kr/3"),
        ]
    )

    assert result == ["A & B", "공지 사항", "<안내>"]


def test_섹션_제목도_같이_풀린다():
    citations = assemble_citations(
        candidates=[_candidate(sectionTitle="&quot;휴게시설&quot; 안내")],
        citation_display_mode="visible",
    )

    assert citations[0]["sectionTitle"] == '"휴게시설" 안내'


def test_엔티티가_없으면_그대로_둔다():
    """休 같은 실제 한자는 건드리면 안 된다."""
    result = _names([_candidate(documentName="休서울이동노동자쉼터 소개- 서울시")])

    assert result == ["休서울이동노동자쉼터 소개- 서울시"]


def test_세_겹_이상은_풀지_않는다():
    """본문에 있던 &amp; 를 잘못 건드리지 않도록 두 번까지만 시도한다."""
    result = _names([_candidate(documentName="&amp;amp;quot;깊은중첩&amp;amp;quot;")])

    assert result == ["&quot;깊은중첩&quot;"]


def test_장식_마커와_엔티티가_같이_있어도_정리된다():
    citations = assemble_citations(
        candidates=[_candidate(sectionTitle="■ &quot;공지&quot;")],
        citation_display_mode="visible",
    )

    assert citations[0]["sectionTitle"] == '"공지"'

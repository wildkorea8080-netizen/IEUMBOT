"""추천 질문이 맥락을 보고, 등록 자료로 답할 수 있는 것만 남는지 확인한다.

이전에는 현재 질문과 답변 600자만 보고 LLM이 자유롭게 질문을 지어냈다.
이용자가 그 버튼을 누르면 "근거를 찾지 못했습니다"가 뜨는 일이 생겼다.
추천이 없느니만 못한 상태였다.
"""

from unittest.mock import patch

from app.services.chat import followup_service as svc


class _Msg:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


CANDIDATES = [
    {
        "contentSignals": {
            "sectionTitle": "융자 신청 자격",
            "textPreview": "농업법인은 최근 3년 이내 결산서를 제출해야 신청할 수 있습니다.",
            "contextText": "",
        }
    },
    {
        "contentSignals": {
            "sectionTitle": "",
            "textPreview": "접수 기간은 매년 3월과 9월입니다.",
            "contextText": "",
        }
    },
]


# ── grounding 텍스트 조립 ────────────────────────────────────────────────────


def test_근거_텍스트는_contentSignals에서_읽는다():
    """최상위에 textContent 같은 키는 없다. 잘못 읽으면 조용히 빈 문자열이 된다."""
    text = svc._grounding_text(CANDIDATES)

    assert "농업법인은 최근 3년" in text
    assert "접수 기간은 매년 3월" in text
    assert "융자 신청 자격" in text  # 섹션 제목도 함께 넣는다


def test_근거가_없으면_빈_문자열():
    assert svc._grounding_text([]) == ""
    assert svc._grounding_text([{"combinedScore": 0.5}]) == ""


# ── 대화 맥락 ────────────────────────────────────────────────────────────────


def test_대화_이력을_역할과_함께_묶는다():
    history = svc._history_text(
        [
            _Msg("user", "융자 받으려면 어떻게 하나요?"),
            _Msg("assistant", "농업법인은 결산서가 필요합니다."),
        ]
    )

    assert "사용자: 융자 받으려면" in history
    assert "챗봇: 농업법인은" in history


def test_이력이_없으면_빈_문자열():
    assert svc._history_text([]) == ""


# ── 검증: 등록 자료로 답할 수 있는 질문만 ────────────────────────────────────


def _fake_db(distances):
    """cosine_distance 결과를 순서대로 돌려주는 가짜 세션."""
    calls = iter(distances)

    class _Result:
        def scalar(self):
            return next(calls)

    class _DB:
        def execute(self, _stmt):
            return _Result()

    return _DB()


def test_유사도가_낮은_질문은_버린다():
    questions = ["융자 자격은?", "우주여행 예약은?"]
    # distance 0.1 → similarity 0.9 (통과) / distance 0.9 → similarity 0.1 (탈락)
    with (
        patch.object(svc, "__name__", svc.__name__),
        patch(
            "app.services.embedding_service.generate_embeddings_batch",
            return_value=[[0.1] * 1536, [0.2] * 1536],
        ),
        patch("app.repositories.admin.search_control_repository._build_base_stmt"),
    ):
        result = svc.verify_against_knowledge(
            questions,
            db=_fake_db([0.1, 0.9]),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == ["융자 자격은?"]


def test_등록_청크가_없으면_전부_버린다():
    """distance 가 None = 비교할 청크가 하나도 없음."""
    with (
        patch(
            "app.services.embedding_service.generate_embeddings_batch", return_value=[[0.1] * 1536]
        ),
        patch("app.repositories.admin.search_control_repository._build_base_stmt"),
    ):
        result = svc.verify_against_knowledge(
            ["아무 질문"],
            db=_fake_db([None]),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == []


def test_임베딩이_통째로_실패하면_검증을_건너뛴다():
    """검증은 품질 장치지 차단 장치가 아니다. OpenAI 장애로 추천이 사라지면 안 된다."""
    with patch(
        "app.services.embedding_service.generate_embeddings_batch",
        side_effect=RuntimeError("quota"),
    ):
        result = svc.verify_against_knowledge(
            ["질문1", "질문2"],
            db=_fake_db([]),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == ["질문1", "질문2"]


def test_개별_임베딩_실패는_그_질문만_통과시킨다():
    with (
        patch(
            "app.services.embedding_service.generate_embeddings_batch",
            return_value=[None, [0.2] * 1536],
        ),
        patch("app.repositories.admin.search_control_repository._build_base_stmt"),
    ):
        result = svc.verify_against_knowledge(
            ["판단불가", "탈락대상"],
            db=_fake_db([0.9]),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == ["판단불가"]


# ── 전체 흐름 ────────────────────────────────────────────────────────────────


def test_답변하지_못한_턴에는_추천하지_않는다():
    result, source = svc.build_follow_up_questions(
        question="q",
        answer_text="a",
        outcome="insufficient_evidence",
        candidates=[],
        db=object(),
        organization_id="org",
        chatbot_id="bot",
    )

    assert result == []
    assert source is None


def test_관리자_풀은_검증하지_않고_그대로_쓴다():
    """사람이 보고 넣은 질문이다. 자동 생성물과 신뢰도가 다르다."""
    pool = ["등록된 질문 A", "등록된 질문 B", "등록된 질문 C"]

    with patch.object(svc, "verify_against_knowledge") as verify:
        result, source = svc.build_follow_up_questions(
            question="융자",
            answer_text="답변",
            outcome="answered",
            candidates=[],
            db=object(),
            organization_id="org",
            chatbot_id="bot",
            question_pool=pool,
            use_llm=False,
        )

    assert source == "admin_pool"
    assert len(result) == 3
    verify.assert_not_called()


def test_검증을_통과한_질문이_없으면_아무것도_안_보여준다():
    with (
        patch.object(svc, "_generate_with_llm", return_value=["없는 내용 질문"]),
        patch.object(svc, "verify_against_knowledge", return_value=[]),
    ):
        result, source = svc.build_follow_up_questions(
            question="q",
            answer_text="a",
            outcome="answered",
            candidates=CANDIDATES,
            db=object(),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == []
    assert source is None


def test_검증_통과분만_최대_3개_반환한다():
    with (
        patch.object(svc, "_generate_with_llm", return_value=["q1", "q2", "q3", "q4"]),
        patch.object(svc, "verify_against_knowledge", side_effect=lambda qs, **_: qs),
    ):
        result, source = svc.build_follow_up_questions(
            question="원질문",
            answer_text="a",
            outcome="answered",
            candidates=CANDIDATES,
            db=object(),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == ["q1", "q2", "q3"]
    assert source == "llm_verified"


def test_원래_질문과_같은_추천은_제외한다():
    with (
        patch.object(
            svc,
            "_generate_with_llm",
            return_value=["융자 자격은 어떻게 되나요?", "서류는 무엇인가요?"],
        ),
        patch.object(svc, "verify_against_knowledge", side_effect=lambda qs, **_: qs),
    ):
        result, _ = svc.build_follow_up_questions(
            question="융자 자격은 어떻게 되나요",  # 물음표만 다름
            answer_text="a",
            outcome="answered",
            candidates=CANDIDATES,
            db=object(),
            organization_id="org",
            chatbot_id="bot",
        )

    assert result == ["서류는 무엇인가요?"]


def test_대화_맥락과_근거가_생성_프롬프트에_들어간다():
    captured = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return ["질문"]

    with (
        patch.object(svc, "_generate_with_llm", side_effect=_capture),
        patch.object(svc, "verify_against_knowledge", side_effect=lambda qs, **_: qs),
    ):
        svc.build_follow_up_questions(
            question="현재 질문",
            answer_text="현재 답변",
            outcome="answered",
            candidates=CANDIDATES,
            db=object(),
            organization_id="org",
            chatbot_id="bot",
            recent_messages=[_Msg("user", "이전 질문입니다")],
        )

    assert "이전 질문입니다" in captured["history"]
    assert "농업법인은 최근 3년" in captured["grounding"]

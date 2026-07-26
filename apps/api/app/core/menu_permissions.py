"""기관사용자(institution_user) 메뉴 접근 권한 키의 표준 목록.

기관관리자가 기관사용자별로 이 키들을 부여한다(Admin.menu_permissions).
프론트엔드 사이드바(admin-nav)와 1:1 대응한다.
'관리자 관리(team)'와 '기관 설정 쓰기'는 기관관리자 전용이라 여기에 포함하지 않는다
(백엔드에서 require_institution_admin_strict로 별도 차단).
"""

# 순서 = UI 표시 순서
MENU_KEYS: tuple[str, ...] = (
    "dashboard",            # 대시보드
    "ai_basic",             # AI 기본설정
    "ai_style",             # 대화 스타일 설정
    "widget",               # 위젯 설정
    "conditional",          # 조건별 답변 설정
    "knowledge_register",   # 지식등록
    "knowledge_list",       # 지식관리
    "api_connect",          # API 연동
    "test_chat",            # 대화 테스트
    "install_guide",        # 설치 안내
    "chat_logs",            # 대화관리
    "subject_distribution",  # 상담 주제 분포
    "security",             # 보안센터
)

MENU_KEY_SET = frozenset(MENU_KEYS)


def sanitize_menu_permissions(values: object) -> list[str]:
    """임의 입력 → 유효 키만, 정의 순서로, 중복 제거."""
    if not isinstance(values, list):
        return []
    given = {str(v) for v in values if isinstance(v, str)}
    return [key for key in MENU_KEYS if key in given]

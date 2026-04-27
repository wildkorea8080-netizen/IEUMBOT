# 13_ADMIN_CONSOLE_SPEC.md

## 1. 목적
관리자 콘솔은 품질/안전 정책을 운영 가능한 형태로 제어해야 한다.

## 2. 화면별 품질 강화 요구

### 2.1 챗봇 설정
필수 설정 항목:
- 답변 우선순위 정책(고정값, 순서 변경 불가)
- 근거 충족 임계치(`evidenceThreshold`)
- 추측 금지 정책 토글(항목별 세부 on/off는 MVP에서 read-only)
- 외부검색 예외정책(기본 OFF, 제한 도메인)

### 2.2 문서 관리
- 문서 메타데이터 입력 필수:
  - 버전
  - 시행일
  - 담당부서
  - 대상
  - 예외
- 전처리 결과 미리보기:
  - 페이지/섹션 추출 품질
  - 필수 메타데이터 누락 경고

### 2.3 웹 소스 관리
- 실시간 스크래핑 옵션 제거
- 정기 색인 스케줄만 허용
- 공식 도메인 화이트리스트 강제

### 2.4 테스트 채팅
- 질의 정규화 결과 표시
- 질문 분해 결과 표시
- evidence check 결과 표시
- 폴백 발생 사유 표시

### 2.5 상담 로그
테이블 컬럼 최소:
- requestId
- normalizedQuery
- sourcePriorityPath
- evidenceScore
- fallbackType
- noGuessTriggered
- citationCount

## 3. 권한 가정(MVP)
- `admin` 단일 역할
- 계정 관리 최소 기능(생성/비활성)
- 고급 RBAC는 제외

## 4. 상태 처리
- Empty: “데이터 없음” + 다음 액션 안내
- Loading: 스켈레톤
- Error: 재시도 버튼 + requestId 표시

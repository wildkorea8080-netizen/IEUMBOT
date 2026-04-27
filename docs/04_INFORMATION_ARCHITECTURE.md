# 04. 정보 구조

이 문서는 이음봇(IEUMBOT)의 공개 위젯 경험과 관리자 콘솔의 정보 구조를 정의합니다. 프런트엔드 구현 시 화면 단위, 메뉴, 라우팅, 컴포넌트, 화면별 데이터 요구사항의 기준으로 사용합니다.

## 1. 전체 정보 구조 개요

### 공개 위젯 영역

- 기존 웹사이트에 삽입되는 독립 UI입니다.
- 방문자는 플로팅 런처 버튼을 통해 채팅 패널을 열고 닫습니다.
- 주요 정보 단위는 환영 영역, 빠른 액션, 메시지 목록, 출처 영역, 입력 영역, 오류와 도움말 상태입니다.

### 관리자 콘솔 영역

- 운영자와 관리자가 문서, 웹 출처, 챗봇 설정, 개인정보 정책, 로그, 분석, 관리자 계정을 관리하는 웹 애플리케이션입니다.
- 좌측 또는 상단 내비게이션을 기준으로 주요 메뉴를 이동합니다.
- 모든 관리자 화면은 조직 또는 챗봇 컨텍스트를 기준으로 데이터를 조회합니다.

## 2. 공개 위젯 화면 계층

```text
공개 웹사이트
└─ 이음봇 위젯
   ├─ 런처 버튼
   └─ 채팅 패널
      ├─ 헤더
      ├─ 환영 영역
      ├─ 빠른 액션 버튼
      ├─ 채팅 메시지 목록
      │  ├─ 사용자 메시지
      │  ├─ 봇 메시지
      │  ├─ 로딩 메시지
      │  └─ 오류 메시지
      ├─ 출처 영역
      ├─ 폴백/도움말 상태
      └─ 입력 영역
```

## 3. 공개 위젯 내비게이션 관계

- 런처 버튼 클릭
  - 닫힘 상태에서 채팅 패널 열림 상태로 전환합니다.

- 패널 닫기 버튼 클릭
  - 채팅 패널을 닫고 런처 버튼만 남깁니다.
  - 세션과 메시지 목록은 설정된 보존 정책에 따라 유지합니다.

- 빠른 액션 버튼 클릭
  - 해당 버튼의 질문 텍스트를 메시지로 전송합니다.
  - 링크형 액션이면 새 탭 또는 현재 탭 이동 정책을 따릅니다.

- 출처 클릭
  - 문서 출처 상세를 펼치거나 원문 링크를 엽니다.
  - PDF 페이지 링크가 있으면 해당 위치로 이동합니다.

- 재시도 버튼 클릭
  - 실패한 마지막 질문을 동일 세션에서 다시 전송합니다.

- 도움말 또는 문의 버튼 클릭
  - 관리자 설정에 등록된 문의처, FAQ, 담당 부서 링크로 이동합니다.

## 4. 공개 위젯 주요 컴포넌트

### 런처 버튼

역할:

- 위젯 진입점입니다.
- 채팅 패널 열림 여부를 제어합니다.

구성 요소:

- 챗봇 아이콘
- 읽지 않은 안내 배지 또는 새 공지 배지
- 접근성 라벨

필요 데이터:

- `chatbotId`
- `launcherIconUrl`
- `launcherLabel`
- `themeColor`
- `position`
- `isWidgetEnabled`
- `unreadNoticeCount`

### 채팅 패널

역할:

- 사용자가 질문하고 답변을 확인하는 기본 화면입니다.

구성 요소:

- 헤더
- 메시지 스크롤 영역
- 출처 영역
- 입력 영역
- 닫기 버튼

필요 데이터:

- `sessionId`
- `chatbotName`
- `chatbotStatus`
- `operatingHours`
- `messages`
- `quickActions`
- `privacyNotice`
- `fallbackConfig`
- `theme`

### 헤더

역할:

- 현재 챗봇의 정체성과 상태를 표시합니다.

구성 요소:

- 챗봇 이름
- 상태 표시
- 닫기 버튼
- 선택형 메뉴 버튼

필요 데이터:

- `chatbotName`
- `statusText`
- `isOutsideBusinessHours`
- `organizationName`

### 환영 영역

역할:

- 첫 진입 시 사용자가 무엇을 질문할 수 있는지 안내합니다.

구성 요소:

- 인사말
- 짧은 사용 안내
- 개인정보 입력 주의 문구
- 운영시간 외 안내 배너

필요 데이터:

- `welcomeMessage`
- `descriptionText`
- `privacyNotice`
- `businessHoursMessage`
- `emergencyNotice`

### 빠른 액션 버튼

역할:

- 자주 묻는 질문 또는 주요 링크를 빠르게 실행합니다.

구성 요소:

- 질문형 버튼
- 링크형 버튼
- 카테고리형 버튼

필요 데이터:

- `quickActions[].id`
- `quickActions[].label`
- `quickActions[].type`
- `quickActions[].payload`
- `quickActions[].url`
- `quickActions[].sortOrder`
- `quickActions[].isEnabled`

### 채팅 메시지

역할:

- 사용자 질문, 봇 답변, 상태 메시지를 시간순으로 표시합니다.

구성 요소:

- 사용자 메시지 버블
- 봇 메시지 버블
- 답변 로딩 상태
- 오류 메시지
- 재시도 버튼
- 시간 표시

필요 데이터:

- `messageId`
- `role`
- `content`
- `createdAt`
- `status`
- `requestId`
- `citations`
- `errorCode`
- `masked`

### 출처 영역

역할:

- 답변의 근거 문서와 위치를 표시합니다.

구성 요소:

- 출처 목록
- 문서명
- 페이지 번호
- 문서 조각 미리보기
- 원문 열기 링크
- 접기와 펼치기 제어

필요 데이터:

- `citations[].documentId`
- `citations[].documentTitle`
- `citations[].pageNumber`
- `citations[].sectionTitle`
- `citations[].snippet`
- `citations[].sourceUrl`
- `citations[].score`

### 입력 영역

역할:

- 질문 입력과 전송을 담당합니다.

구성 요소:

- 텍스트 입력창
- 전송 버튼
- 입력 제한 안내
- 로딩 또는 비활성 상태

필요 데이터:

- `maxMessageLength`
- `placeholder`
- `isSubmitting`
- `isInputEnabled`
- `disabledReason`

### 폴백/도움말 상태

역할:

- 답변 불가, 오류, 운영시간 외, 문서 없음 상태를 안내합니다.

구성 요소:

- 제한 응답 메시지
- 문의처 안내
- 관련 링크
- 재시도 버튼
- 빠른 액션 대체 버튼

필요 데이터:

- `fallbackMessage`
- `helpLinks`
- `contactInfo`
- `retryAvailable`
- `reasonCode`

## 5. 관리자 콘솔 화면 계층

```text
관리자 콘솔
├─ 로그인
├─ 대시보드
├─ 문서 관리
│  ├─ 문서 목록
│  ├─ 문서 업로드
│  ├─ 문서 상세
│  └─ 문서 처리 상태
├─ 웹 출처 관리
│  ├─ 출처 목록
│  ├─ 출처 등록
│  ├─ 크롤링/동기화 상태
│  └─ 제외 규칙
├─ 챗봇 설정
│  ├─ 기본 정보
│  ├─ 위젯 표시 설정
│  ├─ 페르소나/톤 설정
│  └─ 운영시간 설정
├─ 개인정보 설정
│  ├─ 마스킹 규칙
│  ├─ 로그 보관 정책
│  └─ 개인정보 안내 문구
├─ 빠른 액션
│  ├─ 액션 목록
│  ├─ 액션 생성
│  └─ 표시 순서 관리
├─ 테스트 채팅
│  ├─ 테스트 대화
│  └─ 검색 근거 디버그
├─ 채팅 로그
│  ├─ 대화 로그
│  ├─ 오류 로그
│  └─ 요청 상세
├─ 분석/리포팅
│  ├─ 사용량 지표
│  ├─ 질문 분석
│  ├─ 답변 품질 지표
│  └─ 문서 활용도
└─ 관리자 관리
   ├─ 관리자 목록
   ├─ 역할/권한
   └─ 감사 로그
```

## 6. 관리자 콘솔 메뉴 구조

### 1차 메뉴

- 대시보드
- 문서 관리
- 웹 출처 관리
- 챗봇 설정
- 개인정보 설정
- 빠른 액션
- 테스트 채팅
- 채팅 로그
- 분석/리포팅
- 관리자 관리

### 공통 상단 영역

- 조직 선택
- 챗봇 선택
- 현재 환경 표시
- 관리자 프로필 메뉴
- 알림 또는 처리 실패 배지

필요 데이터:

- `currentOrganization`
- `currentChatbot`
- `environment`
- `adminUser`
- `adminRole`
- `notificationCount`
- `failedJobCount`

### 권한에 따른 메뉴 노출

- 문서 운영자
  - 대시보드, 문서 관리, 테스트 채팅, 채팅 로그 일부

- 챗봇 운영자
  - 대시보드, 챗봇 설정, 빠른 액션, 테스트 채팅, 채팅 로그

- 보안 관리자
  - 개인정보 설정, 채팅 로그, 감사 로그

- 최고 관리자
  - 전체 메뉴

## 7. 관리자 화면별 정보 구조

### 로그인

목적:

- 인증된 관리자만 콘솔에 접근하게 합니다.

주요 컴포넌트:

- 계정 ID 또는 이메일 입력
- 비밀번호 입력
- 로그인 버튼
- 오류 메시지
- 비밀번호 재설정 링크

필요 데이터:

- `email`
- `password`
- `returnUrl`
- `authError`
- `isSubmitting`

연결 화면:

- 성공 시 대시보드
- 실패 시 로그인 화면 유지
- 세션 만료 시 로그인 화면으로 리다이렉트

### 대시보드

목적:

- 운영자가 현재 챗봇 상태와 주요 지표를 빠르게 확인합니다.

주요 컴포넌트:

- 챗봇 상태 카드
- 문서 처리 상태 카드
- 오늘의 대화 수
- 답변 실패율
- 출처 포함 응답 비율
- 최근 오류 목록
- 최근 업로드 문서 목록
- 빠른 이동 버튼

필요 데이터:

- `chatbotStatus`
- `documentStats`
- `todayConversationCount`
- `answerFailureRate`
- `citationRate`
- `recentErrors`
- `recentDocuments`
- `pendingJobs`

연결 화면:

- 문서 처리 실패 클릭 시 문서 상세
- 최근 오류 클릭 시 로그 상세
- 빠른 이동으로 문서 업로드, 테스트 채팅, 설정 이동

### 문서 관리

목적:

- PDF 문서 업로드, 상태 확인, 재처리, 삭제, 버전 관리를 수행합니다.

주요 컴포넌트:

- 문서 목록 테이블
- 업로드 버튼
- 상태 필터
- 검색 입력
- 문서 상세 패널
- 처리 상태 타임라인
- 재처리 버튼
- 삭제 또는 비활성화 버튼

필요 데이터:

- `documents[].id`
- `documents[].title`
- `documents[].fileName`
- `documents[].status`
- `documents[].version`
- `documents[].uploadedBy`
- `documents[].uploadedAt`
- `documents[].processedAt`
- `documents[].chunkCount`
- `documents[].errorMessage`
- `documents[].isActive`

연결 화면:

- 업로드 버튼에서 문서 업로드 모달
- 문서 행 클릭 시 문서 상세
- 테스트 버튼 클릭 시 테스트 채팅으로 이동

### 웹 출처 관리

목적:

- 승인된 웹 콘텐츠를 지식 소스로 등록하고 동기화 상태를 관리합니다.

주요 컴포넌트:

- 웹 출처 목록
- URL 또는 도메인 등록 폼
- 허용 도메인 설정
- 제외 경로 규칙
- 동기화 주기 설정
- 마지막 수집 상태
- 수동 동기화 버튼

필요 데이터:

- `webSources[].id`
- `webSources[].name`
- `webSources[].baseUrl`
- `webSources[].allowedDomains`
- `webSources[].excludedPaths`
- `webSources[].syncStatus`
- `webSources[].lastSyncedAt`
- `webSources[].pageCount`
- `webSources[].isEnabled`

연결 화면:

- 출처 등록 후 상세 화면
- 동기화 실패 클릭 시 로그 상세
- 수집된 페이지 클릭 시 출처 상세

### 챗봇 설정

목적:

- 챗봇의 기본 정보, 위젯 표시, 페르소나, 답변 톤, 운영시간을 설정합니다.

주요 컴포넌트:

- 기본 정보 폼
- 위젯 미리보기
- 색상 선택
- 아이콘 설정
- 위치 설정
- 페르소나 텍스트 영역
- 톤 선택
- 출처 표시 옵션
- 운영시간 입력
- 저장 버튼

필요 데이터:

- `chatbotName`
- `welcomeMessage`
- `descriptionText`
- `themeColor`
- `launcherIconUrl`
- `position`
- `persona`
- `tone`
- `answerLength`
- `citationDisplayMode`
- `businessHours`
- `fallbackMessage`
- `settingsVersion`

연결 화면:

- 저장 후 현재 화면 유지
- 미리보기에서 테스트 채팅 이동
- 변경 충돌 시 최신 설정 다시 불러오기

### 개인정보 설정

목적:

- 개인정보 마스킹, 로그 보관, 사용자 안내 문구를 관리합니다.

주요 컴포넌트:

- 마스킹 사용 여부 토글
- 기본 패턴 목록
- 사용자 정의 패턴 목록
- 로그 보관 기간 설정
- 개인정보 안내 문구 입력
- 마스킹 테스트 입력
- 저장 버튼

필요 데이터:

- `maskingEnabled`
- `defaultPatterns`
- `customPatterns`
- `retentionDays`
- `privacyNotice`
- `maskingTestInput`
- `maskingTestResult`
- `updatedBy`
- `updatedAt`

연결 화면:

- 마스킹 테스트 실행 후 같은 화면 결과 표시
- 로그 보관 정책 변경 시 확인 모달

### 빠른 액션

목적:

- 위젯 초기 화면과 대화 중 표시할 빠른 액션 버튼을 관리합니다.

주요 컴포넌트:

- 액션 목록
- 생성 버튼
- 라벨 입력
- 액션 유형 선택
- 질문 또는 URL 입력
- 표시 위치 선택
- 활성 토글
- 드래그 앤 드롭 순서 변경
- 위젯 미리보기

필요 데이터:

- `quickActions[].id`
- `quickActions[].label`
- `quickActions[].type`
- `quickActions[].payload`
- `quickActions[].url`
- `quickActions[].displayLocation`
- `quickActions[].sortOrder`
- `quickActions[].isEnabled`

연결 화면:

- 저장 후 목록 갱신
- 미리보기에서 챗봇 설정 화면과 동일한 위젯 미리보기 사용

### 테스트 채팅

목적:

- 운영 배포 전 설정과 문서 색인 기반 답변 품질을 검증합니다.

주요 컴포넌트:

- 테스트 채팅 패널
- 질문 입력창
- 사용자 표시 답변 미리보기
- 검색 근거 디버그 패널
- 검색 점수 표시
- 요청 ID 표시
- 설정 상태 요약

필요 데이터:

- `testSessionId`
- `messages`
- `retrievedChunks`
- `citations`
- `scores`
- `requestId`
- `activeDocuments`
- `settingsSnapshot`
- `modelStatus`

연결 화면:

- 검색된 문서 클릭 시 문서 상세
- 오류 요청 ID 클릭 시 로그 상세
- 설정 수정 버튼으로 챗봇 설정 이동

### 채팅 로그

목적:

- 실제 사용자 대화와 시스템 오류를 조회하고 품질 문제를 추적합니다.

주요 컴포넌트:

- 로그 필터
- 대화 로그 테이블
- 오류 로그 테이블
- 로그 상세 패널
- 출처 목록
- 처리 시간 표시
- 요청 ID 복사 버튼

필요 데이터:

- `logs[].requestId`
- `logs[].sessionId`
- `logs[].createdAt`
- `logs[].questionMasked`
- `logs[].answer`
- `logs[].status`
- `logs[].latencyMs`
- `logs[].citations`
- `logs[].errorCode`
- `logs[].modelName`
- `logs[].documentIds`

연결 화면:

- 출처 문서 클릭 시 문서 상세
- 오류 코드 클릭 시 오류 로그 상세
- 필터 변경 시 같은 화면 목록 갱신

### 분석/리포팅

목적:

- 사용량, 답변 품질, 문서 활용도를 운영 지표로 확인합니다.

주요 컴포넌트:

- 기간 선택
- 대화 수 차트
- 평균 응답 시간
- 답변 실패율
- 출처 포함 응답 비율
- 인기 질문 목록
- 미응답 질문 목록
- 문서별 활용도
- 빠른 액션 클릭률
- 리포트 내보내기 버튼

필요 데이터:

- `dateRange`
- `conversationCountSeries`
- `averageLatencyMs`
- `failureRate`
- `citationRate`
- `topQuestions`
- `unansweredQuestions`
- `documentUsage`
- `quickActionCtr`
- `exportStatus`

연결 화면:

- 미응답 질문 클릭 시 채팅 로그 필터 적용
- 문서 활용도 클릭 시 문서 상세
- 리포트 내보내기 후 다운로드 상태 표시

### 관리자 관리

목적:

- 관리자 계정, 역할, 권한, 감사 로그를 관리합니다.

주요 컴포넌트:

- 관리자 목록
- 관리자 초대 버튼
- 역할 선택
- 권한 매트릭스
- 계정 상태 토글
- 감사 로그 목록
- 최근 로그인 정보

필요 데이터:

- `admins[].id`
- `admins[].email`
- `admins[].name`
- `admins[].role`
- `admins[].status`
- `admins[].lastLoginAt`
- `permissions`
- `auditLogs`
- `inviteStatus`

연결 화면:

- 관리자 행 클릭 시 상세 패널
- 역할 변경 시 확인 모달
- 감사 로그 클릭 시 상세 정보 표시

## 8. 공통 화면 패턴

### 목록 화면

- 검색 입력
- 상태 필터
- 기간 필터
- 정렬
- 페이지네이션
- 빈 상태
- 로딩 상태
- 오류 상태

필요 데이터:

- `items`
- `totalCount`
- `page`
- `pageSize`
- `sort`
- `filters`
- `isLoading`
- `error`

### 상세 패널

- 선택 항목 요약
- 메타데이터
- 상태
- 관련 로그
- 주요 액션

필요 데이터:

- `selectedId`
- `detail`
- `relatedLogs`
- `availableActions`
- `permissionState`

### 저장 폼

- 필드별 유효성 검증
- 저장 전 변경 여부 감지
- 저장 중 상태
- 저장 성공 메시지
- 서버 검증 오류 표시
- 동시 수정 충돌 처리

필요 데이터:

- `initialValues`
- `currentValues`
- `validationErrors`
- `isDirty`
- `isSaving`
- `saveError`
- `version`

## 9. 내비게이션 및 라우팅 기준

### 관리자 라우트 예시

- `/admin/login`
- `/admin/dashboard`
- `/admin/documents`
- `/admin/documents/:documentId`
- `/admin/web-sources`
- `/admin/settings/chatbot`
- `/admin/settings/privacy`
- `/admin/quick-actions`
- `/admin/test-chat`
- `/admin/logs`
- `/admin/analytics`
- `/admin/admins`

### 라우팅 원칙

- 조직과 챗봇 컨텍스트는 전역 상태 또는 URL 파라미터로 관리합니다.
- 상세 화면은 직접 URL 접근이 가능해야 합니다.
- 권한이 없는 라우트는 접근 불가 화면 또는 대시보드로 이동합니다.
- 세션 만료 시 현재 URL을 `returnUrl`로 보존한 뒤 로그인 화면으로 이동합니다.
- 저장되지 않은 변경사항이 있으면 메뉴 이동 전 확인 모달을 표시합니다.

## 10. 화면별 데이터 로딩 원칙

- 위젯은 초기 로드 시 최소 설정만 먼저 가져옵니다.
- 채팅 메시지는 세션 단위로 필요 시 로드합니다.
- 관리자 콘솔은 대시보드 진입 시 요약 지표만 가져오고 상세 데이터는 각 화면에서 조회합니다.
- 목록 화면은 서버 페이지네이션을 기본으로 합니다.
- 로그와 분석 화면은 기간 필터를 필수로 적용합니다.
- 개인정보 원문은 프런트엔드로 전달하지 않습니다.
- 관리자 테스트 채팅의 디버그 데이터는 관리자 권한이 있을 때만 반환합니다.

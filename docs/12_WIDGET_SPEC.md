# 12_WIDGET_SPEC.md

## 1. 목적
공공기관 사용자에게 안전하고 근거 중심의 상담을 제공한다.  
MVP에서는 “정확한 근거 우선 + 근거 부족 시 안전 폴백”을 위젯 UX에서 명확히 표현한다.

## 2. 핵심 동작 정책
- 답변 우선순위는 서버 정책을 그대로 표시:
  `공식문서 > 공식웹색인 > 공식공지 > 외부검색(예외)`
- 근거 부족 시 추측 답변 금지, 상담 연결 메시지 노출
- 출처는 문서 버전/페이지/섹션까지 표시

## 3. 패널 UI 규격
- 답변 블록은 고정 5구역:
  1) 결론
  2) 근거
  3) 상세 안내
  4) 출처
  5) 주의사항
- `fallback` 응답 수신 시 경고 스타일로 전환

## 4. 퀵액션 동작
- 도메인 코퍼스와 매핑된 질문 템플릿 제공
  - 정책/사업
  - 절차/서식
  - 공지/공고
  - FAQ
  - 연락처/운영시간

## 5. 로딩/오류/세션 처리
- 로딩: “공식 근거 확인 중” 메시지
- 인증 불필요(공개 위젯), 단 rate-limit 오류 안내
- 근거 부족/추측금지 트리거 시 폴백 컴포넌트 강제 노출

## 6. 출처 표시 규칙
- `documentTitle`, `documentVersion`, `pageNumber`, `sectionTitle` 표시
- sourceType 배지:
  - `uploadedDocument`
  - `officialWebsiteIndexed`
  - `officialNotice`
  - `externalWebException`

## 7. 외부검색 예외 표시
- 외부검색이 사용된 경우 반드시 “예외 검색 사용” 라벨 표시
- 공식 도메인 미포함 결과는 위젯에 표시하지 않음

## 8. 이벤트 트래킹(품질 개선용)
- `chat.answerRendered`
- `chat.fallbackShown`
- `chat.noGuessBlocked`
- `chat.citationClicked`
- `chat.escalationClicked`

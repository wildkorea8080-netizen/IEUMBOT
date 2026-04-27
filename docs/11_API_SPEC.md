# 11_API_SPEC.md

## 1. 공통 규칙
- Base Path: `/api`
- 관리자 인증: `Authorization: Bearer <accessToken>`
- JSON 필드명: `camelCase`
- ID 필드명 표준:
  - `organizationId`
  - `chatbotId`
  - `documentId`
  - `documentVersionId`
  - `sessionId`
  - `messageId`

공통 에러:
```json
{
  "error": {
    "code": "INSUFFICIENT_EVIDENCE",
    "message": "근거가 부족합니다.",
    "requestId": "req_xxx"
  }
}
```

## 2. 관리자 인증 API(MVP)

### 2.1 로그인
- `POST /admin/auth/login`

Request:
```json
{
  "email": "admin@example.com",
  "password": "string"
}
```

Response:
```json
{
  "accessToken": "jwt",
  "tokenType": "Bearer",
  "expiresAt": "2026-04-23T12:00:00Z",
  "admin": {
    "id": "uuid",
    "organizationId": "uuid",
    "email": "admin@example.com",
    "name": "홍길동",
    "role": "admin"
  }
}
```

### 2.2 내 정보
- `GET /admin/auth/me`

### 2.3 로그아웃
- `POST /admin/auth/logout`
- Response: `204 No Content`

## 3. 운영 제어(관리자) API

### 3.1 챗봇 설정 조회
- `GET /admin/chatbots/{chatbotId}/settings`

Response(핵심 제어 구조):
```json
{
  "settings": {
    "chatbotId": "uuid",
    "answerPriorityPolicy": [
      "uploadedDocument",
      "officialWebsiteIndexed",
      "officialNotice",
      "externalWebException"
    ],
    "externalSearchExceptionPolicy": {},
    "corpusDomainConfig": {},
    "officialWebIndexSchedule": {},
    "evidenceThreshold": 0.75,
    "answerValidationPolicy": {},
    "noGuessPolicy": {},
    "guardrailPolicy": {}
  }
}
```

### 3.2 챗봇 설정 수정
- `PATCH /admin/chatbots/{chatbotId}/settings`
- 위 제어 필드만 변경 가능

### 3.3 로그 조회
- `GET /admin/logs/chat`

로그 응답 필드(최소):
- `requestId`
- `sessionId`
- `normalizedQuery`
- `sourcePriorityPath`
- `evidenceScore`
- `fallbackType`
- `noGuessTriggered`
- `escalation`

## 4. 챗 API

### 4.1 질의응답
- `POST /chat/messages`
- `POST /chat/messages/stream` (SSE)

Response:
```json
{
  "requestId": "req_xxx",
  "sessionId": "uuid",
  "answer": {
    "conclusion": "요약 결론",
    "reason": "근거 요약",
    "guidance": "상세 안내",
    "caution": "주의사항"
  },
  "citations": [
    {
      "documentTitle": "문서명",
      "documentVersionId": "uuid",
      "pageNumber": 4,
      "sectionTitle": "지원대상",
      "sourceType": "uploadedDocument"
    }
  ],
  "evidenceCheck": {
    "isSufficient": true,
    "score": 0.84,
    "missingReasons": []
  },
  "retrievalTrace": {
    "priorityApplied": [
      "uploadedDocument",
      "officialWebsiteIndexed",
      "officialNotice",
      "externalWebException"
    ],
    "usedSources": ["uploadedDocument", "officialNotice"],
    "externalWebUsed": false
  },
  "guardrailTrace": {
    "noGuessTriggered": false,
    "blockedReason": null
  },
  "escalation": null
}
```

### 4.2 근거 부족 폴백
```json
{
  "requestId": "req_xxx",
  "fallback": {
    "type": "insufficientEvidence",
    "message": "현재 공식 근거가 부족하여 확정 안내가 어렵습니다.",
    "nextAction": "담당부서 문의",
    "contact": {
      "department": "복지지원과",
      "phone": "02-0000-0000",
      "hours": "평일 09:00-18:00"
    }
  },
  "escalation": {
    "required": true,
    "reason": "evidenceInsufficient"
  }
}
```

## 5. 명명 일관성 규칙
- API에는 `orgId`를 사용하지 않고 `organizationId`를 사용한다.
- API에는 `documentVersion` 문자열 대신 식별자 필드는 `documentVersionId`를 사용한다.
- 코퍼스는 `corpusDomain` 키를 사용한다.

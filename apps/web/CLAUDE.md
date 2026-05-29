# apps/web — Next.js 관리자 콘솔

Next.js 14 App Router + TypeScript + Tailwind CSS. 기관 운영자용 관리 콘솔.

## 실행

```bash
# 루트에서
pnpm build:widget    # 위젯 먼저 빌드 (widget.js → public/)
pnpm dev:web         # 개발 서버 http://localhost:3000
```

`widget.js`가 `public/` 에 없으면 `/widget.js` 404 발생.

## 디렉터리 구조

```
apps/web/
├─ app/
│  ├─ admin/                # 관리자 라우트 (App Router)
│  │  ├─ layout.tsx         # 사이드바 + 헤더 레이아웃
│  │  ├─ dashboard/
│  │  ├─ knowledge/         # 지식 목록/등록
│  │  ├─ chatbots/          # 챗봇 설정
│  │  ├─ widget/            # 위젯 설정
│  │  ├─ chat-logs/         # 대화 로그
│  │  ├─ quality-report/    # 품질 리포트
│  │  ├─ knowledge-gap/     # 지식 갭 분석
│  │  ├─ search-control/    # 검색 제어 규칙
│  │  ├─ guardrails/        # 가드레일
│  │  ├─ escalations/       # 에스컬레이션
│  │  ├─ answer-settings/   # 답변 설정
│  │  ├─ quick-actions/     # 빠른 질문
│  │  ├─ install-guide/     # 설치 가이드
│  │  ├─ test-chat/         # 챗봇 테스트
│  │  └─ ...
│  └─ login/
├─ components/
│  └─ admin/                # 관리자 UI 컴포넌트
├─ lib/
│  ├─ api/                  # API 클라이언트 + 타입 정의
│  │  ├─ index.ts           # ApiClient 클래스, ApiClientError
│  │  ├─ admin-operations.ts      # 관리자 API 함수
│  │  ├─ admin-operations-types.ts  # 관리자 API 타입
│  │  └─ ...
│  ├─ safe-html.ts          # HTML sanitizer (FAQ 답변 렌더링용, allowlist)
│  └─ auth/                 # 세션/인증 헬퍼
└─ public/
   └─ widget.js             # 빌드된 위젯 번들 (자동 생성)
```

## API 클라이언트 패턴

```typescript
// lib/api/index.ts — ApiClient 클래스 사용
import { getKnowledgeList, reindexKnowledge } from "@/lib/api/admin-operations";

// 함수는 ApiClientError 를 throw
try {
  const list = await getKnowledgeList({ sourceGroup: "file_text" });
} catch (err) {
  if (err instanceof ApiClientError) {
    console.error(err.code, err.message);  // KNOWLEDGE_NOT_FOUND 등
  }
}
```

타입은 `lib/api/*-types.ts`에서 import. 새 API 추가 시 해당 파일에 타입 먼저 정의.

## 지식 목록 상태 표시 규칙

`KnowledgeItem`의 상태는 `displayStatus`를 우선 사용:

```typescript
// components/admin/knowledge-management.tsx
function effectiveStatus(item: KnowledgeItem): string {
  return item.displayStatus ?? item.status;
}
// statusClass(), statusLabel() 모두 effectiveStatus(item)으로 호출
```

| displayStatus | 배지 색상 | 표시 텍스트 |
|---|---|---|
| `completed` | 초록 | 완료 |
| `queued` | 황색 | 대기 중 |
| `processing` | 황색 | 처리 중 |
| `failed` | 빨강 | 실패 |
| `needs_reindex` | 주황 | 재색인 필요 |
| `stale_failed` | 빨강 | 처리 시간 초과 |

`canSearch == true`이면 "검색 가능" 초록 배지 추가 표시.

## 주요 컴포넌트 위치

```
components/admin/knowledge-management.tsx    # 지식 목록/관리 전체
components/admin/chat-log-viewer.tsx         # 대화 로그 뷰어
components/ui/page-panel.tsx                 # 페이지 레이아웃 패널
```

## 환경 변수

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## 린트/타입 검사

```bash
pnpm --filter @ieumbot/web lint
pnpm --filter @ieumbot/web typecheck
```

## 규칙

- 서버 컴포넌트는 `async` 함수, 클라이언트 컴포넌트는 `"use client"` 최상단 선언
- API 호출은 `lib/api/` 함수를 통해서만 — 컴포넌트에서 `fetch` 직접 호출 금지
- 페이지 컴포넌트는 얇게 유지, 비즈니스 UI 로직은 `components/admin/`으로 분리
- Tailwind 클래스 직접 사용 (별도 CSS 파일 최소화)
- 신뢰할 수 없는 HTML(FAQ 답변, 사용자 입력 등)을 렌더링할 때는 `lib/safe-html.ts`의 `sanitizeHtml()` + `dangerouslySetInnerHTML` 사용. 자동 감지 헬퍼 `looksLikeHtml()`도 제공.

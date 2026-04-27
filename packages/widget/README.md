# @ieumbot/widget

IEUMBOT 공개 임베드 위젯 패키지입니다.

## 현재 동작 범위 (MVP)
- 공개 설정 로드: `GET /api/widget/config/{chatbotId}`
- 사용자 질의응답:
  - SSE 우선: `POST /api/chat/messages/stream`
  - 폴백: `POST /api/chat/messages`
- 결과 렌더링: 답변 본문, 출처(citations), fallback/escalation 안내
- 관리자 진단 데이터(trace/policy/guardrail 내부 값)는 사용자 화면에 노출하지 않음

## 초기화 방식

### 1) 전역 init 호출
```ts
window.IEUMBOTWidget?.init({
  chatbotId: "<CHATBOT_ID>",
  apiBaseUrl: "https://your-domain.com/api",
  openOnLoad: false,
  topK: 8,
});
```

### 2) script data attribute 자동 초기화
```html
<script
  src="/widget.js"
  data-chatbot-id="<CHATBOT_ID>"
  data-api-base-url="https://your-domain.com/api"
  data-open-on-load="false"
></script>
```

## 빌드/배포 경로
- 위젯 정적 파일의 표준 경로는 `/widget.js` 입니다.
- 빌드 산출물 파일: `apps/web/public/widget.js`
- 빌드 명령:

```bash
pnpm run build:widget
```

- 개발 서버 확인:
  - Next.js 실행 후 `http://localhost:3000/widget.js` 접근
  - 404가 발생하면 `pnpm run build:widget`를 먼저 실행

## 보안/경계 원칙
- 위젯은 Shadow DOM으로 호스트 페이지 스타일 충돌을 최소화합니다.
- 내부 프롬프트/가드레일 규칙/디버그 스코어는 렌더링하지 않습니다.
- raw chunk 본문은 노출하지 않습니다.
- SSE 실패 시 자동으로 non-stream 경로로 전환합니다.

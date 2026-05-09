# packages/widget — 임베드 채팅 위젯

TypeScript + Vite. 외부 웹사이트에 삽입되는 독립 번들. Shadow DOM으로 호스트 페이지 격리.

## 빌드

```bash
# 루트에서
pnpm build:widget          # dist/ → apps/web/public/widget.js 복사

# 패키지 단독
pnpm --filter @ieumbot/widget build
pnpm --filter @ieumbot/widget dev   # 개발 모드
```

## 진입점 흐름

```
packages/widget/src/index.ts          # script 태그 data attribute 파싱 → initIeumWidget()
  → bootstrap/widget-app.ts (WidgetApp 클래스)
      constructor()                   # DOM 생성, ieum-floating-loading 클래스 추가 (아이콘 숨김)
      mount()                         # Shadow DOM 생성, 이벤트 바인딩, loadConfig() 호출
      loadConfig()                    # GET /api/widget/config/{chatbotId}
        finally: ieum-floating-loading 제거  # 올바른 아이콘으로 fade-in
```

## 설치 방식

### 1) script data attribute (자동 초기화)
```html
<script
  src="/widget.js"
  data-chatbot-id="<ID>"
  data-api-base-url="https://api.example.com"
  data-launcher-icon="heart"
  data-launcher-icon-url=""
  data-open-on-load="false"
></script>
```

### 2) JS API (수동 초기화)
```javascript
window.IEUMBOTWidget?.init({ chatbotId: "...", apiBaseUrl: "..." });
```

## 아이콘 flash 방지

```typescript
// constructor에서 버튼 숨김
this.floatingButton.classList.add("ieum-floating-loading"); // opacity:0

// loadConfig() finally 블록에서 제거
this.floatingButton.classList.remove("ieum-floating-loading"); // fade-in 0.18s
```

`data-launcher-icon`이 script 태그에 없어도 flash 없음 (config 로드 후 표시).

## API 엔드포인트

```
GET  /api/widget/config/{chatbotId}    # 위젯 공개 설정 로드
POST /api/chat/messages/stream         # SSE 스트리밍 채팅 (우선)
POST /api/chat/messages                # 일반 채팅 (SSE 실패 fallback)
```

## 런처 아이콘 종류

`"chat"` (기본) | `"heart"` | `"shield"` | `"leaf"` | `"spark"` | `"love-chat"` | `"custom"` (URL 필요)

`"custom"` + `launcherIconUrl` → `<img>` 렌더링, 나머지는 SVG.

## 핵심 규칙

- **Shadow DOM 필수** — 호스트 페이지 CSS 충돌 방지
- 관리자 콘솔 전용 라이브러리 import 금지 (번들 크기)
- 내부 프롬프트/가드레일/디버그 스코어 UI 노출 금지
- raw chunk 본문 노출 금지
- SSE 실패 시 자동으로 non-stream fallback

## 빌드 산출물

```
packages/widget/dist/widget.js  →  apps/web/public/widget.js
```

`vite.config.ts`에서 `outDir`와 복사 경로 확인.

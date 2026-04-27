# apps/web

IEUMBOT 관리자 콘솔(Next.js) 프론트엔드 스켈레톤입니다.

## 실행
```bash
pnpm --filter @ieumbot/web dev
```

## 주요 라우트
- `/login`
- `/admin/dashboard`
- `/admin/documents`
- `/admin/settings`
- `/admin/quick-actions`
- `/admin/test-chat`
- `/admin/logs`

## 포함된 스켈레톤
- App Shell: 사이드바 + 헤더 + 본문 레이아웃
- Tailwind CSS 설정
- 공통 API 클라이언트 레이어(`lib/api`)
- 글로벌/관리자 로딩 및 에러 바운더리

## 구현 규칙
- 현재 단계는 내비게이션/레이아웃 중심 스켈레톤만 포함합니다.
- 실제 백엔드 연동/도메인 기능은 다음 단계에서 구현합니다.

## 품질 체크
```bash
pnpm --filter @ieumbot/web lint
pnpm --filter @ieumbot/web typecheck
```

# @ieumbot/ui

공통 UI 패키지 스캐폴드입니다.

## 규약
- 컴포넌트 파일명: `PascalCase.tsx`
- 훅 파일명: `useXxx.ts`
- 유틸 파일명: `camelCase.ts`
- 비즈니스 로직은 포함하지 않고 UI 프리미티브만 유지합니다.

## 품질 규약
```bash
pnpm --filter @ieumbot/ui lint
pnpm --filter @ieumbot/ui typecheck
```

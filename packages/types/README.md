# @ieumbot/types

공통 타입 패키지 스캐폴드입니다.

## 규약
- API DTO 타입은 `camelCase`를 기준으로 정의합니다.
- 백엔드 내부(DB/모델) `snake_case` 타입은 직접 공유하지 않고 API 경계에서 변환합니다.
- API 스펙 변경 시 `docs/11_API_SPEC.md`와 함께 갱신합니다.

## 품질 규약
```bash
pnpm --filter @ieumbot/types lint
pnpm --filter @ieumbot/types typecheck
```

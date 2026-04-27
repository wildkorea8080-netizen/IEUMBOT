# 09. 저장소 구조

이 문서는 이음봇(IEUMBOT)의 모노레포 구조와 파일 배치 규칙을 정의합니다. 구현 단계에서 Codex와 개발자가 같은 기준으로 파일을 생성하고 수정할 수 있도록 경로, 명명 규칙, 공유 코드 규칙, 환경 변수 전략, 브랜치와 커밋 규칙을 명확히 둡니다.

## 1. 최상위 폴더 구조

권장 최상위 구조는 다음과 같습니다.

```text
IEUMBOT/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  ├─ widget/
│  ├─ ui/
│  └─ types/
├─ infra/
├─ scripts/
├─ docs/
├─ .env.example
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

## 2. 폴더별 목적

### `apps/web`

- Next.js 기반 관리자 콘솔입니다.
- 관리자 로그인, 대시보드, 문서 관리, 설정, 테스트 채팅, 로그, 분석 화면을 포함합니다.
- 사용자 공개 홈페이지가 아니라 운영자용 콘솔입니다.

### `apps/api`

- FastAPI 기반 백엔드입니다.
- 관리자 API, 위젯 설정 API, 채팅 API, 문서 업로드 API, RAG 처리 API를 제공합니다.
- 문서 처리 워커 진입점도 이 앱 안에 둡니다.

### `packages/widget`

- 외부 홈페이지에 삽입되는 임베더블 채팅 위젯입니다.
- 독립 번들로 빌드되어 Nginx 또는 CDN에서 제공됩니다.
- 호스트 사이트와 CSS, 전역 상태 충돌이 없어야 합니다.

### `packages/ui`

- 관리자 콘솔과 위젯에서 공유 가능한 UI primitives를 둡니다.
- 버튼, 입력, 모달, 토스트, 배지, 테이블 구성요소를 포함할 수 있습니다.
- 위젯 번들 크기에 영향을 주므로 무거운 관리자 전용 컴포넌트는 넣지 않습니다.

### `packages/types`

- 프런트엔드 TypeScript 타입과 API 계약 타입을 둡니다.
- OpenAPI에서 생성한 타입 또는 수동 정의한 공통 DTO 타입을 관리합니다.
- 백엔드 Python 타입의 원천은 아니지만, API 응답 구조 동기화 기준으로 사용합니다.

### `infra`

- Docker, Nginx, 데이터베이스 초기화, 배포 설정을 둡니다.
- 환경별 설정 템플릿과 운영 관련 파일을 관리합니다.

### `scripts`

- 개발, 검증, 문서 생성, 데이터 초기화, 마이그레이션 보조 스크립트를 둡니다.
- 재사용 가능한 자동화만 배치하고, 일회성 실험 파일은 커밋하지 않습니다.

### `docs`

- 제품, 요구사항, 아키텍처, API, 보안, 테스트, 운영 문서를 둡니다.
- 번호가 붙은 기준 문서는 이 디렉터리에서 관리합니다.

## 3. 앱과 패키지 내부 구조

### `apps/web` 내부 구조

```text
apps/web/
├─ app/
│  ├─ admin/
│  │  ├─ dashboard/
│  │  ├─ documents/
│  │  ├─ web-sources/
│  │  ├─ settings/
│  │  ├─ quick-actions/
│  │  ├─ test-chat/
│  │  ├─ logs/
│  │  ├─ analytics/
│  │  └─ admins/
│  ├─ login/
│  └─ layout.tsx
├─ components/
├─ features/
├─ lib/
├─ hooks/
├─ styles/
├─ public/
├─ tests/
├─ next.config.ts
└─ package.json
```

규칙:

- 라우트는 `app/` 아래에 둡니다.
- 화면별 비즈니스 UI는 `features/{domain}`에 둡니다.
- 재사용 UI는 `components/` 또는 `packages/ui`로 분리합니다.
- API 클라이언트, 인증 헬퍼, 환경 변수 접근은 `lib/`에 둡니다.
- 화면 가까이에만 쓰는 컴포넌트는 해당 feature 폴더에 둡니다.

### `apps/api` 내부 구조

```text
apps/api/
├─ app/
│  ├─ main.py
│  ├─ api/
│  │  ├─ admin/
│  │  ├─ widget/
│  │  ├─ chat/
│  │  └─ health.py
│  ├─ core/
│  ├─ db/
│  ├─ models/
│  ├─ schemas/
│  ├─ services/
│  ├─ repositories/
│  ├─ workers/
│  ├─ integrations/
│  └─ utils/
├─ migrations/
├─ tests/
├─ pyproject.toml
└─ Dockerfile
```

규칙:

- FastAPI 라우터는 `app/api/{domain}`에 둡니다.
- DB 모델은 `models/`, Pydantic 요청과 응답 스키마는 `schemas/`에 둡니다.
- 비즈니스 로직은 `services/`에 둡니다.
- DB 접근은 `repositories/`에 둡니다.
- OpenAI, 스토리지, Redis 등 외부 연동은 `integrations/`에 둡니다.
- 문서 처리 워커는 `workers/`에 둡니다.
- 설정, 로깅, 인증 공통 코드는 `core/`에 둡니다.

### `packages/widget` 내부 구조

```text
packages/widget/
├─ src/
│  ├─ main.tsx
│  ├─ bootstrap/
│  ├─ components/
│  ├─ features/
│  ├─ api/
│  ├─ styles/
│  ├─ state/
│  └─ utils/
├─ public/
├─ tests/
├─ vite.config.ts
└─ package.json
```

규칙:

- `main.tsx`는 위젯 부트스트랩만 담당합니다.
- DOM 삽입, Shadow DOM 생성, 설정 읽기는 `bootstrap/`에 둡니다.
- 채팅 메시지, 입력창, 출처, 빠른 액션은 `components/` 또는 `features/chat`에 둡니다.
- 위젯 API 호출은 `api/`에 둡니다.
- 위젯 전용 상태 관리는 `state/`에 둡니다.
- 위젯은 관리자 콘솔의 무거운 의존성을 가져오지 않습니다.

### `packages/ui` 내부 구조

```text
packages/ui/
├─ src/
│  ├─ components/
│  ├─ tokens/
│  ├─ hooks/
│  ├─ utils/
│  └─ index.ts
├─ tests/
└─ package.json
```

규칙:

- 외부 패키지 의존성은 최소화합니다.
- UI 컴포넌트는 접근성 속성을 기본으로 고려합니다.
- 도메인 로직을 포함하지 않습니다.
- `index.ts`에서 공개 API를 명시적으로 export합니다.

### `packages/types` 내부 구조

```text
packages/types/
├─ src/
│  ├─ api/
│  ├─ domain/
│  ├─ widget/
│  ├─ admin/
│  └─ index.ts
├─ generated/
└─ package.json
```

규칙:

- API 요청과 응답 타입은 `api/`에 둡니다.
- 도메인 공통 타입은 `domain/`에 둡니다.
- 자동 생성 타입은 `generated/`에 두고 직접 수정하지 않습니다.
- 수동 타입은 자동 생성 타입과 이름 충돌이 없게 관리합니다.

### `infra` 내부 구조

```text
infra/
├─ nginx/
│  ├─ nginx.conf
│  └─ conf.d/
├─ docker/
│  ├─ api.Dockerfile
│  ├─ web.Dockerfile
│  └─ worker.Dockerfile
├─ postgres/
│  └─ init/
├─ redis/
└─ environments/
   ├─ local/
   ├─ staging/
   └─ production/
```

규칙:

- 운영 비밀 값은 저장소에 커밋하지 않습니다.
- 환경별 예시는 템플릿으로만 제공합니다.
- Nginx 설정 변경은 배포 전 문법 검증을 거쳐야 합니다.

### `scripts` 내부 구조

```text
scripts/
├─ dev/
├─ db/
├─ docs/
├─ test/
└─ ops/
```

규칙:

- 스크립트는 실행 목적이 파일명에서 드러나야 합니다.
- 파괴적 스크립트는 이름에 `reset`, `drop`, `delete` 등 위험 동사를 명시합니다.
- 운영 스크립트는 실행 전 필요한 환경 변수와 영향 범위를 주석 또는 문서로 남깁니다.

## 4. 명명 규칙

### 공통

- 디렉터리명은 소문자와 하이픈을 사용합니다.
- 파일명은 역할이 드러나게 작성합니다.
- 약어는 프로젝트에서 합의된 것만 사용합니다.
- 한국어 파일명은 사용하지 않습니다.

### TypeScript

- React 컴포넌트 파일: `PascalCase.tsx`
- 일반 유틸 파일: `camelCase.ts`
- 훅 파일: `useSomething.ts`
- 타입 파일: `something.types.ts`
- 테스트 파일: `Something.test.tsx` 또는 `something.test.ts`

예:

- `DocumentTable.tsx`
- `useChatStream.ts`
- `chat.types.ts`
- `formatDate.ts`

### Python

- 파일과 모듈: `snake_case.py`
- 클래스: `PascalCase`
- 함수와 변수: `snake_case`
- Pydantic 스키마: `SomethingCreate`, `SomethingUpdate`, `SomethingRead`
- SQLAlchemy 모델: 단수형 `Document`, `ChatMessage`

예:

- `document_service.py`
- `chat_router.py`
- `document_repository.py`

### 환경 변수

- 대문자와 언더스코어를 사용합니다.
- 앱 접두사를 붙여 범위를 구분합니다.

예:

- `API_DATABASE_URL`
- `API_REDIS_URL`
- `API_OPENAI_API_KEY`
- `WEB_PUBLIC_API_BASE_URL`
- `WIDGET_PUBLIC_API_BASE_URL`

## 5. 파일 조직 규칙

- 기능 단위 파일은 사용하는 앱 또는 패키지 안에 먼저 둡니다.
- 두 곳 이상에서 실제로 재사용될 때만 `packages/`로 이동합니다.
- 도메인별 코드와 기술별 코드를 섞지 않습니다.
- API 라우터는 얇게 유지하고, 비즈니스 로직은 서비스 계층으로 이동합니다.
- 데이터베이스 접근은 repository 계층에서 처리합니다.
- 프런트엔드 화면은 라우트, feature, 공유 컴포넌트를 구분합니다.
- 테스트 파일은 대상 코드 근처 또는 각 앱의 `tests/`에 일관되게 배치합니다.
- 자동 생성 파일은 직접 수정하지 않고 생성 명령과 원천 파일을 문서화합니다.

## 6. 공유 코드 규칙

### 공유해도 되는 코드

- API 타입
- 공통 UI primitives
- 디자인 토큰
- 날짜와 문자열 포맷 유틸
- 공통 검증 규칙
- 위젯과 관리자에서 모두 쓰는 작은 헬퍼

### 공유하지 말아야 할 코드

- 관리자 전용 화면 로직
- 위젯 전용 DOM 부트스트랩 로직
- 백엔드 Python 비즈니스 로직을 TypeScript로 중복 구현한 코드
- 특정 화면에만 쓰이는 컴포넌트
- 번들 크기를 크게 늘리는 라이브러리 래퍼

### 공유 패키지 변경 규칙

- `packages/ui` 변경 시 관리자 콘솔과 위젯 빌드를 모두 확인합니다.
- `packages/types` 변경 시 API 응답과 프런트엔드 사용처를 함께 확인합니다.
- 공유 패키지에 의존성을 추가할 때는 위젯 번들 크기 영향을 검토합니다.

## 7. 환경 변수 전략

### 원칙

- 실제 비밀 값은 저장소에 커밋하지 않습니다.
- 모든 필요한 환경 변수는 `.env.example`에 문서화합니다.
- 앱별 환경 변수는 접두사로 구분합니다.
- 브라우저에 노출되는 값과 서버 전용 값을 명확히 분리합니다.

### 파일 예시

```text
.env.example
apps/web/.env.example
apps/api/.env.example
packages/widget/.env.example
```

### 주요 변수 예시

```text
API_DATABASE_URL=
API_REDIS_URL=
API_OPENAI_API_KEY=
API_FILE_STORAGE_DRIVER=
API_FILE_STORAGE_BUCKET=
API_SESSION_SECRET=
API_ALLOWED_ORIGINS=

WEB_PUBLIC_API_BASE_URL=
WEB_SESSION_COOKIE_NAME=

WIDGET_PUBLIC_API_BASE_URL=
WIDGET_PUBLIC_ASSET_BASE_URL=
```

### 노출 규칙

- `PUBLIC`이 포함된 변수만 브라우저 번들에 노출할 수 있습니다.
- OpenAI API 키, DB URL, Redis URL, 세션 시크릿은 서버 전용입니다.
- 위젯에 들어가는 값은 외부 사용자에게 보인다고 가정합니다.

## 8. 브랜치와 커밋 규칙

### 브랜치 규칙

- 기본 브랜치: `main`
- 기능 브랜치: `feat/{short-description}`
- 버그 수정 브랜치: `fix/{short-description}`
- 문서 브랜치: `docs/{short-description}`
- 운영 변경 브랜치: `chore/{short-description}`

예:

- `feat/admin-document-upload`
- `fix/widget-sse-retry`
- `docs/api-spec`

### 커밋 메시지 규칙

Conventional Commits 형식을 사용합니다.

```text
type(scope): summary
```

주요 타입:

- `feat`: 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 동작 변경 없는 구조 개선
- `test`: 테스트 추가 또는 수정
- `chore`: 빌드, 설정, 도구 변경
- `infra`: 배포와 인프라 변경

예:

- `docs(prd): add product requirements`
- `feat(widget): add launcher button`
- `fix(api): handle document ingestion failure`
- `infra(nginx): add sse proxy settings`

## 9. 문서 배치 규칙

### 기준 문서

- 제품과 설계 기준 문서는 `docs/`에 번호순으로 둡니다.
- 파일명은 대문자 스네이크 케이스를 사용합니다.
- 예: `07_SYSTEM_ARCHITECTURE.md`

### 앱별 문서

- 특정 앱 실행 방법은 해당 앱의 `README.md`에 둡니다.
- 예: `apps/api/README.md`, `apps/web/README.md`

### 운영 문서

- 배포, 백업, 복구, 장애 대응은 `docs/18_DEPLOYMENT_OPERATIONS.md`에 우선 정리합니다.
- 운영 스크립트 사용법은 `scripts/ops/README.md`에 둘 수 있습니다.

### API 문서

- 사람이 읽는 API 명세는 `docs/11_API_SPEC.md`에 둡니다.
- 자동 생성 OpenAPI 파일은 `apps/api/openapi.json` 또는 `docs/generated/openapi.json`에 둘 수 있습니다.
- 자동 생성 파일은 생성 명령을 문서화합니다.

### 변경 규칙

- 기능 요구사항을 바꾸면 관련 PRD, 기능 요구사항, API, 테스트 계획 문서를 함께 검토합니다.
- 아키텍처 변경은 `07_SYSTEM_ARCHITECTURE.md`와 `08_TECH_STACK.md`를 함께 갱신합니다.
- 데이터 모델 변경은 `10_DATABASE_SCHEMA.md`와 마이그레이션을 함께 갱신합니다.

## 10. 예시 트리 구조

```text
IEUMBOT/
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ admin/
│  │  │  │  ├─ dashboard/
│  │  │  │  ├─ documents/
│  │  │  │  ├─ web-sources/
│  │  │  │  ├─ settings/
│  │  │  │  ├─ quick-actions/
│  │  │  │  ├─ test-chat/
│  │  │  │  ├─ logs/
│  │  │  │  ├─ analytics/
│  │  │  │  └─ admins/
│  │  │  ├─ login/
│  │  │  └─ layout.tsx
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ hooks/
│  │  ├─ lib/
│  │  ├─ styles/
│  │  ├─ tests/
│  │  └─ package.json
│  └─ api/
│     ├─ app/
│     │  ├─ main.py
│     │  ├─ api/
│     │  │  ├─ admin/
│     │  │  ├─ widget/
│     │  │  ├─ chat/
│     │  │  └─ health.py
│     │  ├─ core/
│     │  ├─ db/
│     │  ├─ models/
│     │  ├─ schemas/
│     │  ├─ services/
│     │  ├─ repositories/
│     │  ├─ workers/
│     │  ├─ integrations/
│     │  └─ utils/
│     ├─ migrations/
│     ├─ tests/
│     ├─ pyproject.toml
│     └─ Dockerfile
├─ packages/
│  ├─ widget/
│  │  ├─ src/
│  │  │  ├─ main.tsx
│  │  │  ├─ bootstrap/
│  │  │  ├─ components/
│  │  │  ├─ features/
│  │  │  ├─ api/
│  │  │  ├─ state/
│  │  │  ├─ styles/
│  │  │  └─ utils/
│  │  ├─ tests/
│  │  ├─ vite.config.ts
│  │  └─ package.json
│  ├─ ui/
│  │  ├─ src/
│  │  │  ├─ components/
│  │  │  ├─ tokens/
│  │  │  ├─ hooks/
│  │  │  ├─ utils/
│  │  │  └─ index.ts
│  │  ├─ tests/
│  │  └─ package.json
│  └─ types/
│     ├─ src/
│     │  ├─ api/
│     │  ├─ domain/
│     │  ├─ widget/
│     │  ├─ admin/
│     │  └─ index.ts
│     ├─ generated/
│     └─ package.json
├─ infra/
│  ├─ nginx/
│  │  ├─ nginx.conf
│  │  └─ conf.d/
│  ├─ docker/
│  ├─ postgres/
│  │  └─ init/
│  ├─ redis/
│  └─ environments/
│     ├─ local/
│     ├─ staging/
│     └─ production/
├─ scripts/
│  ├─ dev/
│  ├─ db/
│  ├─ docs/
│  ├─ test/
│  └─ ops/
├─ docs/
│  ├─ README.md
│  ├─ 01_PROJECT_OVERVIEW.md
│  ├─ 02_PRD.md
│  ├─ 03_USER_FLOWS.md
│  ├─ 04_INFORMATION_ARCHITECTURE.md
│  ├─ 05_FUNCTIONAL_REQUIREMENTS.md
│  ├─ 06_NON_FUNCTIONAL_REQUIREMENTS.md
│  ├─ 07_SYSTEM_ARCHITECTURE.md
│  ├─ 08_TECH_STACK.md
│  └─ 09_REPOSITORY_STRUCTURE.md
├─ .env.example
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

## 11. Codex 작업 기준

- 새 기능을 만들기 전에 관련 문서 번호를 확인합니다.
- 코드 생성은 이 문서의 경로 규칙을 따릅니다.
- 앱 전용 로직은 해당 `apps/*` 안에 둡니다.
- 두 앱 이상에서 쓰기 전까지는 `packages/*`로 성급히 이동하지 않습니다.
- 비밀 값이 필요한 파일은 `.env.example`만 수정하고 실제 `.env`는 커밋하지 않습니다.
- 문서만 작성하는 작업에서는 `apps/`, `packages/`, `infra/` 코드를 만들지 않습니다.
- 구현 작업에서 새 디렉터리를 만들면 해당 목적을 가까운 `README.md` 또는 관련 문서에 반영합니다.

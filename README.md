# IEUMBOT Monorepo

IEUMBOT 초기 모노레포 스캐폴딩 저장소입니다. 현재는 구조/규약 중심이며 비즈니스 기능은 포함하지 않습니다.

## 디렉터리
- `apps/web`: Next.js 관리자 콘솔
- `apps/api`: FastAPI 백엔드
- `packages/widget`: 임베더블 위젯 패키지
- `packages/ui`: 공통 UI 패키지
- `packages/types`: 공통 타입 패키지
- `infra/docker`: 컨테이너 빌드 설정
- `infra/nginx`: 리버스 프록시 설정
- `scripts`: 개발/운영 스크립트
- `docs`: 설계/요구사항 문서

## 빠른 시작
1. 루트 `.env.example`를 복사해 `.env`를 생성합니다.
2. Docker Compose로 실행합니다.

```bash
docker compose up -d --build
```

기본 URL:
- Web: `http://localhost:3000`
- API: `http://localhost:8000/api`
- Nginx: `http://localhost:8080`

## 로컬 개발
```bash
pnpm install
pnpm run build:widget
pnpm dev:web
```

위젯 정적 파일 경로:
- `apps/web/public/widget.js`
- 브라우저 확인: `http://localhost:3000/widget.js`

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

API 로컬 개발용 관리자 시드:

```bash
cd apps/api
seed-local-admins
```

기본 관리자 계정은 저장소에 하드코딩되어 배포되지 않습니다. 위 시드 명령은 `API_ENV`가 `local`, `development`, `dev`, `test`일 때만 동작하며 다음 계정을 생성하거나 갱신합니다.
- `super_admin`: `super@example.com` / `SuperAdmin123!`
- `institution_admin`: `admin@example.com` / `Admin1234!`

## 코딩 컨벤션
- API JSON 필드명은 `camelCase`를 사용합니다.
- Python 내부 변수/함수/모듈명, DB 관련 필드명은 `snake_case`를 사용합니다.
- FastAPI 스키마는 `app/schemas/base.py`의 `ApiSchema`를 상속해 snake_case ↔ camelCase 매핑을 강제합니다.
- API prefix는 `docs/11_API_SPEC.md` 기준으로 `admin`, `widget`, `chat`, `health`를 사용합니다.

## 린트/포맷
```bash
pnpm lint
pnpm format
pnpm format:check
```

Python만 실행:
```bash
ruff check apps/api
ruff format apps/api
```

## 참조 문서
- `docs/09_REPOSITORY_STRUCTURE.md`
- `docs/11_API_SPEC.md`
- `docs/16_SECURITY_PRIVACY_SPEC.md`

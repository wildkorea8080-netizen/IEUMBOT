# apps/api

IEUMBOT FastAPI 백엔드 스켈레톤입니다.

## 실행
```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 로컬 개발용 관리자 시드
기본 관리자 계정은 저장소에 포함되어 있지 않습니다.

아래 명령은 `API_ENV`가 `local`, `development`, `dev`, `test`일 때만 동작합니다.

```bash
cd apps/api
seed-local-admins
```

모듈 직접 실행:

```bash
cd apps/api
python -m app.scripts.seed_local_admins
```

생성 또는 갱신되는 계정:
- `super_admin`: `super@example.com` / `SuperAdmin123!`
- `institution_admin`: `admin@example.com` / `Admin1234!`

`institution_admin` 계정에는 `local-dev-institution` 조직이 자동으로 준비됩니다.
운영 환경에서는 이 명령을 실행하지 마십시오.

## DB 스키마 구성
- ORM: SQLAlchemy 2.0
- Migration: Alembic
- DB: PostgreSQL + pgvector
- 초기 마이그레이션: `alembic/versions/20260423_0001_initial_schema.py`

## 마이그레이션 실행 방법
루트 `.env`에 `API_DATABASE_URL`을 먼저 설정한 뒤 실행합니다.

```bash
cd apps/api
alembic upgrade head
```

현재 리비전 확인:
```bash
alembic current
```

다운그레이드:
```bash
alembic downgrade -1
```

## 모델 범위
다음 테이블 모델이 구현되어 있습니다.
- organizations
- admins
- chatbot_settings
- documents
- document_versions
- document_chunks
- web_sources
- quick_actions
- chat_sessions
- chat_messages
- citations
- audit_logs
- ingestion_jobs

## MVP 관리자 인증 API
- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/logout`

## 공개 채팅 런타임 API
- `POST /api/chat/messages` (non-stream)
- `POST /api/chat/messages/stream` (SSE)
- `GET /api/widget/config/{chatbotId}` (위젯 공개 초기화 설정)

`login` 응답의 `accessToken`을 `Authorization: Bearer <token>` 헤더로 전달합니다.

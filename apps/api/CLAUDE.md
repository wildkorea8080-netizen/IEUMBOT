# apps/api — FastAPI 백엔드

Python 3.11 + FastAPI + SQLAlchemy 2.0 + PostgreSQL(pgvector).

## 실행

```bash
cd apps/api
pip install -e ".[dev]"
alembic upgrade head                          # 로컬 처음 셋업 시
uvicorn app.main:app --reload --port 8000
```

배포는 `scripts/start.sh` (alembic + seed + uvicorn). 자세한 건 `RENDER.md` 참조.

API 문서: `http://localhost:8000/docs`

## 디렉터리 구조

```
app/
├─ main.py                  # FastAPI 앱 생성, lifespan, Sentry/CORS/health
├─ api/
│  ├─ admin/                # 관리자 전용 엔드포인트
│  ├─ widget/               # 위젯 공개 엔드포인트
│  ├─ chat/                 # 채팅 엔드포인트 (SSE 포함)
│  └─ health.py             # /api/health (liveness) + /api/health/ready (DB+Redis ping)
├─ core/
│  ├─ config.py             # Pydantic Settings (환경변수)
│  ├─ crypto.py             # 세션/토큰 암호화
│  ├─ cache.py              # Redis-or-memory 캐시 (get/set/delete + get_local for 민감)
│  ├─ sentry.py             # SENTRY_DSN 가용 시 SDK 초기화
│  └─ middleware/
├─ db/
│  ├─ session.py            # SessionLocal, get_db_session
│  └─ base.py               # Base = declarative_base()
├─ models/                  # SQLAlchemy 모델 (단수형 PascalCase)
├─ schemas/                 # Pydantic 스키마 (ApiSchema 상속)
├─ services/
│  ├─ admin/                # 관리자 비즈니스 로직
│  ├─ chat/
│  │  ├─ answer_cache.py    # 시맨틱 답변 캐시(USE_ANSWER_CACHE)
│  │  ├─ answer_generation_service.py   # OpenAI/Anthropic SDK 호출
│  │  └─ ...
│  ├─ embedding_service.py  # OpenAI 임베딩 + 7일 캐시
│  ├─ web_fetcher.py        # httpx.Client 싱글톤 (HTML/바이너리 fetch)
│  └─ widget_install_script.py
├─ repositories/
├─ workers/                 # Arq 워커 (USE_ARQ_WORKER=true 시 활성)
│  ├─ main.py               # WorkerSettings, process_reindex_job, sync cron
│  └─ dispatch.py           # sync→async enqueue 브릿지
├─ integrations/
└─ scripts/
   ├─ start.sh              # 배포 통합 진입점 (alembic + seed + uvicorn)
   ├─ render_start.sh       # Render 호환 위임
   └─ seed_local_admins.py
alembic/                    # DB 마이그레이션
```

## DB 마이그레이션 (Alembic)

```bash
# 마이그레이션 적용
alembic upgrade head

# 새 마이그레이션 생성 (모델 변경 후)
alembic revision --autogenerate -m "add_column_x_to_y"

# 이전 버전으로 롤백
alembic downgrade -1
```

**주의**:
- `--autogenerate` 결과는 항상 검토. 불필요한 컬럼 삭제나 타입 변경이 포함될 수 있음.
- **앱 시작 시 자동 마이그레이션 없음** — `scripts/start.sh` 또는 Coolify pre-deploy가 책임. 시작 시 `_log_schema_status()`가 현재 리비전 vs head 비교 후 경고 로그(`[SCHEMA] up-to-date|out of date`)만.

## 핵심 모델 관계

```
Organization
  └─ ChatbotSetting (챗봇 설정, 테마, 정책)
       ├─ Document → DocumentVersion → DocumentChunk (임베딩 포함)
       ├─ WebSource (웹사이트 색인 소스)
       ├─ IngestionJob (색인 작업 상태 추적)
       ├─ ChatSession → ChatMessage → Citation
       ├─ FaqItem (시맨틱 매칭, RAG 전 우선 검사)
       └─ QuickAction
```

`DocumentChunk.embedding` = `Vector(1536)` (pgvector, HNSW 인덱스)

## 지식 색인 흐름 (knowledge_service.py)

```python
# 파일 업로드 → 동기 처리 (HTTP 요청 내에서 완료)
create_file_knowledge_service()
  → _ingest_document_version_content()
    → _extract_document_text()                # PDF/DOCX/XLSX/HWP 등 (Vision SDK fallback)
    → _split_text_chunks(900, 120)            # chunk_size=900, overlap=120
    → generate_embeddings_batch()             # OpenAI SDK + 7일 캐시
    → db.add(DocumentChunk(embedding=...))
    → version.status = "completed" / "failed"
    → db.commit()
    → _invalidate_chatbot_answer_cache()      # 답변 캐시 즉시 무효화

# 재색인 → Arq 또는 BackgroundTasks 디스패치
reindex_knowledge_service()
  → version.status = "queued", job.status = "queued"  → db.commit()
  → _dispatch_reindex(): USE_ARQ_WORKER=true 면 Arq enqueue, 아니면 BackgroundTasks fallback
  → _process_reindex_job()                    # 워커/백그라운드에서 실행
    → finally: _invalidate_answer_cache_from_knowledge()  # 챗봇 단위 캐시 flush
```

**중요**:
- `USE_ARQ_WORKER=false`(기본)면 BackgroundTasks가 동일 프로세스에서 실행 → 재시작 시 유실 가능.
- stale recovery: list 조회 시 queued 10분 / processing 30분 초과 job 자동 복구.

## 임베딩 서비스 (embedding_service.py)

- 모델: `text-embedding-3-small`, 차원: 1536
- 공식 OpenAI/Azure OpenAI **SDK** (LRU 클라이언트 싱글톤, 자동 재시도)
- **7일 캐시** — `sha256(model + normalized_text)`. Redis 가용 시 인스턴스 간 공유.
- `generate_embedding_or_raise()` — 실패 시 `EmbeddingFailure` raise
- `generate_embedding()` — 실패 시 None 반환 (silent)
- `generate_embeddings_batch()` — 배치 호출 + 항목별 캐시 히트 분리
- 키 없으면 `OPENAI_API_KEY_MISSING` 에러

## RAG 검색 (search_control_repository.py)

```python
fetch_retrieval_candidates():
  1. 키워드 검색: text_content LIKE, section_title LIKE, title LIKE
  2. 벡터 검색: embedding.cosine_distance(query_embedding)   # HNSW 인덱스
  3. 결과 합산 (중복 제거) → limit_count개 반환

# 검색 필터 (include_inactive=False일 때)
Document.status == "active"
DocumentVersion.status == "completed"
DocumentVersion.is_active == True
DocumentVersion.is_search_suppressed == False
```

## 채팅 파이프라인 (final_chat_pipeline_service.py)

```
run_final_chat_pipeline()
  → privacy_block / security_block 조기 반환
  → _simple_natural_response (인사 등) 조기 반환
  → recent_messages 로드
  → [USE_ANSWER_CACHE=true 시] answer_cache.get_cached() — 히트면 즉시 반환(~50ms)
  → retrieve_for_precheck()
      → 점수 계산 + 임계값 필터 (파일 0.32, 웹 0.28, FAQ 0.25)
      → 상위 5청크 선택 (MAX_PROMPT_CHUNKS=5)
  → FAQ 시맨틱 매칭 (score ≥ 0.82 → early return)
  → build_answer_prompt()  → [S1]~[S5] 근거 포함 system/user 프롬프트
  → generate_grounded_answer()  # OpenAI/Anthropic SDK
  → 응답 직전 answer_cache.store()  # 첫턴 + answered만
```

## 캐시 / 워커 / 관측성

| 모듈 | 파일 | 활성화 |
|---|---|---|
| Redis-or-memory 캐시 | `core/cache.py` | `API_REDIS_URL` 가용 시 Redis, 아니면 in-memory |
| 임베딩 캐시 (7일) | `services/embedding_service.py` | 항상 (캐시 모듈 의존) |
| runtime_api_config 캐시 (60s, local) | `services/llm_api_config_runtime_service.py` | 항상 (api_key 포함이므로 set_local) |
| 시맨틱 답변 캐시 (10min) | `services/chat/answer_cache.py` | `USE_ANSWER_CACHE=true` |
| Arq 워커 | `workers/main.py` | `USE_ARQ_WORKER=true` + Redis |
| Sentry | `core/sentry.py` | `SENTRY_DSN` 설정 |

답변 캐시 무효화: `faq_service` CRUD + `knowledge_service.patch/delete/reindex` 후 `answer_cache.invalidate_chatbot(chatbot_id)` 자동 호출.

## Pydantic 스키마 규칙

```python
from app.schemas import ApiSchema  # ConfigDict(alias_generator=to_camel) 포함

class MyResponse(ApiSchema):
    my_field: str        # API JSON에서는 myField로 직렬화됨
    another_field: int
```

## 린트/포맷

```bash
ruff check app           # 린트 (E, F, I, UP, B 규칙)
ruff format app          # 포맷 (line-length=100, double quote)
```

pyproject.toml 기준: `line-length = 100`, `ignore = ["E501"]`

## 환경 변수 주요 항목

```bash
# 필수
API_DATABASE_URL=postgresql://user:pass@localhost:5432/ieumbot
API_OPENAI_API_KEY=sk-...
API_SESSION_SECRET=...                    # 세션 서명 키
API_ALLOWED_ORIGINS=http://localhost:3000
API_WIDGET_PUBLIC_API_BASE_URL=http://localhost:8000

# 선택 — 성능/배포
API_REDIS_URL=redis://redis:6379/0        # Arq + 공유 캐시. 없으면 in-memory fallback.
USE_ARQ_WORKER=false                       # true → Arq 워커 디스패치 (다중 인스턴스 안전)
USE_ANSWER_CACHE=false                     # true → 답변 캐시 (~13s → ~50ms)
ANSWER_CACHE_TTL_SECONDS=600

# 선택 — 관측성
SENTRY_DSN=                                # 미설정 시 SDK skip
SENTRY_ENVIRONMENT=                        # 미설정 시 api_env 사용
SENTRY_TRACES_SAMPLE_RATE=0.0              # 운영 0.05~0.2 권장
```

전체는 `app/core/config.py`의 `Settings` 클래스.

## 외부 HTTP 호출 규칙 (중요)

**`urllib.request` 직접 사용 금지.** 모든 외부 호출은 다음 중 하나:

| 용도 | 사용할 것 |
|---|---|
| OpenAI Responses/Chat Completions | `openai.OpenAI` (via `answer_generation_service._build_openai_client`) |
| OpenAI 임베딩 | `embedding_service.generate_embedding*` (캐시 + SDK 자동) |
| Anthropic Messages | `anthropic.Anthropic` (via `answer_generation_service._build_anthropic_client`) |
| 웹 페이지/바이너리 fetch | `app.services.web_fetcher.get_client()` (httpx 싱글톤) |
| 사용자 정의 외부 API | `web_fetcher.get_client()` |

## 헬스 체크

- `GET /api/health` — liveness, 항상 200. 컨테이너 OOM/deadlock 감지용.
- `GET /api/health/ready` — readiness. Postgres `SELECT 1` + Redis PING.
  - Postgres 실패 → 503 (LB가 트래픽 차단)
  - Redis는 optional (unconfigured/unavailable이어도 200)

Coolify probe로 사용 권장.

## 로그 패턴

코드 전반에서 구조화 로그 사용 (검색 가능 키=값):

```python
# 색인
logger.info("[INGEST_FLOW] knowledge_id=%s phase=%s chunk_count=%s", ...)
logger.info("[INGEST_HEALTH] db_status=%s display_status=%s can_search=%s", ...)
logger.warning("[INGEST_RECOVERY] action=%s reason=%s", ...)

# 임베딩 + 캐시
logger.info("[EMBEDDING] provider=%s source=%s model=%s text_len=%s", ...)
logger.info("[EMBEDDING_CACHE_HIT] model=%s text_len=%s", ...)
logger.info("[EMBEDDING_BATCH_CACHE] batch_start=%s hits=%s misses=%s", ...)

# 답변 캐시
logger.info("[ANSWER_CACHE_HIT] chatbot_id=%s question_len=%s", ...)
logger.info("[ANSWER_CACHE_STORE] chatbot_id=%s question_len=%s ttl=%ss", ...)
logger.info("[ANSWER_CACHE_INVALIDATE] chatbot_id=%s deleted=%s", ...)

# Arq 디스패치
logger.info("[ARQ_DISPATCH] enqueued reindex knowledge_id=%s job_id=%s", ...)
logger.info("[ARQ_TASK] process_reindex_job started knowledge_id=%s", ...)
logger.info("[ARQ_CRON] sync_due_web_sources started", ...)

# 채팅 파이프라인
logger.info("[PIPELINE] start chatbot_id=%s question_len=%s", ...)
logger.info("[FAQ] matched id=%s score=%.3f question=%s", ...)
logger.info("[RAG_THRESHOLD] threshold=%s retrieved=%s used=%s top_score=%s", ...)

# 웹 fetch
logger.info("[WEB_CRAWL] url=%s status=%s extracted_text_length=%s", ...)
logger.warning("[WEB_FETCH_SKIP] url=%s status=%s reason=%s", ...)

# 라이프사이클
logger.info("[SCHEMA] up-to-date revision=%s", ...)
logger.warning("[SCHEMA] DB out of date — current=%s expected=%s", ...)
logger.info("[SENTRY] 초기화 완료 env=%s traces_rate=%.3f", ...)
```

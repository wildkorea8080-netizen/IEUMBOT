# apps/api — FastAPI 백엔드

Python 3.11 + FastAPI + SQLAlchemy 2.0 + PostgreSQL(pgvector).

## 실행

```bash
cd apps/api
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

API 문서: `http://localhost:8000/docs`

## 디렉터리 구조

```
app/
├─ main.py                  # FastAPI 앱 생성, 라우터 등록, 미들웨어
├─ api/
│  ├─ admin/                # 관리자 전용 엔드포인트
│  ├─ widget/               # 위젯 공개 엔드포인트
│  ├─ chat/                 # 채팅 엔드포인트 (SSE 포함)
│  └─ health.py
├─ core/
│  ├─ config.py             # Pydantic Settings (환경변수)
│  ├─ crypto.py             # 세션/토큰 암호화
│  └─ middleware/
├─ db/
│  ├─ session.py            # SessionLocal, get_db_session
│  └─ base.py               # Base = declarative_base()
├─ models/                  # SQLAlchemy 모델 (단수형 PascalCase)
├─ schemas/                 # Pydantic 스키마 (ApiSchema 상속)
├─ services/
│  ├─ admin/                # 관리자 비즈니스 로직
│  ├─ chat/                 # 채팅 파이프라인
│  ├─ embedding_service.py  # OpenAI 임베딩 (text-embedding-3-small, 1536d)
│  └─ widget_install_script.py
├─ repositories/
│  ├─ admin/
│  └─ chat/
├─ integrations/            # 외부 서비스 연동
└─ scripts/                 # seed 등 유틸 스크립트
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

**주의**: `--autogenerate` 결과는 항상 검토. 불필요한 컬럼 삭제나 타입 변경이 포함될 수 있음.

## 핵심 모델 관계

```
Organization
  └─ ChatbotSetting (챗봇 설정, 테마, 정책)
       ├─ Document → DocumentVersion → DocumentChunk (임베딩 포함)
       ├─ WebSource (웹사이트 색인 소스)
       ├─ IngestionJob (색인 작업 상태 추적)
       ├─ ChatSession → ChatMessage → Citation
       └─ QuickAction
```

`DocumentChunk.embedding` = `Vector(1536)` (pgvector)

## 지식 색인 흐름 (knowledge_service.py)

```python
# 파일 업로드 → 동기 처리 (HTTP 요청 내에서 완료)
create_file_knowledge_service()
  → _ingest_document_version_content()
    → _extract_document_text()          # PDF/DOCX/XLSX/HWP 등
    → _split_text_chunks(900, 120)      # chunk_size=900, overlap=120
    → generate_embedding_or_raise()     # OpenAI API 호출
    → db.add(DocumentChunk(embedding=...))
    → version.status = "completed" / "failed"
    → db.commit()

# 재색인 → background_tasks로 비동기 처리
reindex_knowledge_service()
  → version.status = "queued", job.status = "queued"  → db.commit()
  → background_tasks.add_task(_process_reindex_job)
```

**중요**: 재색인 background task는 Render에서 프로세스 재시작 시 유실될 수 있음.
stale recovery: list 조회 시 queued 10분 / processing 30분 초과 job 자동 복구.

## 임베딩 서비스 (embedding_service.py)

- 모델: `text-embedding-3-small`, 차원: 1536
- OpenAI 또는 Azure OpenAI 지원
- `generate_embedding_or_raise()` — 실패 시 `EmbeddingFailure` raise
- `generate_embedding()` — 실패 시 None 반환 (silent)
- 키 없으면 `OPENAI_API_KEY_MISSING` 에러

## RAG 검색 (search_control_repository.py)

```python
fetch_retrieval_candidates():
  1. 키워드 검색: text_content LIKE, section_title LIKE, title LIKE
  2. 벡터 검색: embedding.cosine_distance(query_embedding)
  3. 결과 합산 (중복 제거) → limit_count개 반환

# 검색 필터 (include_inactive=False일 때)
Document.status == "active"
DocumentVersion.status == "completed"
DocumentVersion.is_active == True
DocumentVersion.is_search_suppressed == False
```

## 채팅 파이프라인 (final_chat_pipeline_service.py)

```
retrieve_for_precheck()
  → 점수 계산 + 임계값 필터 (파일 0.32, 웹 0.28, FAQ 0.25)
  → 상위 5청크 선택 (MAX_PROMPT_CHUNKS=5)

build_answer_prompt()
  → [S1]~[S5] 근거 포함 system/user 프롬프트 조립

generate_grounded_answer() / generate_chat_sse_stream()
  → OpenAI Chat Completions API 호출
```

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
API_DATABASE_URL=postgresql://user:pass@localhost:5432/ieumbot
API_OPENAI_API_KEY=sk-...
API_SESSION_SECRET=...                    # 세션 서명 키
API_ALLOWED_ORIGINS=http://localhost:3000
API_WIDGET_PUBLIC_API_BASE_URL=http://localhost:8000
```

`app/core/config.py`의 `Settings` 클래스에서 전체 목록 확인.

## 로그 패턴

코드 전반에서 구조화 로그 사용:

```python
logger.info("[INGEST_FLOW] knowledge_id=%s phase=%s chunk_count=%s", ...)
logger.info("[INGEST_HEALTH] db_status=%s display_status=%s can_search=%s", ...)
logger.warning("[INGEST_RECOVERY] action=%s reason=%s", ...)
logger.info("[EMBEDDING] requested=%s success=%s failed=%s", ...)
logger.info("[WEB_CRAWL] url=%s status=%s extracted_text_length=%s", ...)
```

# IEUMBOT — Claude Code 가이드

공공기관·조직용 문서 기반 AI 챗봇 플랫폼. 관리자가 PDF·웹사이트를 등록하면 RAG 파이프라인으로 색인하고, 임베드 위젯을 통해 사용자 질문에 근거 기반 답변을 제공한다.

## 저장소 구조

```
IEUMBOT/
├─ apps/web/          # Next.js 14 관리자 콘솔 (Vercel 배포)
├─ apps/api/          # FastAPI 백엔드 (Render 배포)
├─ packages/widget/   # 임베드 채팅 위젯 (빌드 → apps/web/public/widget.js)
├─ packages/ui/       # 공유 UI 컴포넌트
├─ packages/types/    # 공유 TypeScript 타입
├─ docs/              # 상세 설계 문서 (20개 md)
└─ scripts/           # 개발·운영 보조 스크립트
```

## 핵심 명령어

### 프론트엔드 (pnpm 9, Node 루트에서 실행)

```bash
pnpm build:widget          # 위젯 빌드 (web dev 전 필수)
pnpm dev:web               # 관리자 콘솔 개발 서버
pnpm build:web             # 위젯 빌드 후 web 프로덕션 빌드
pnpm lint:ts               # ESLint (apps/web + packages)
pnpm format:ts             # Prettier 포맷
pnpm format:check:ts       # Prettier 검사
```

### 백엔드 (apps/api 디렉터리에서 실행)

```bash
pip install -e ".[dev]"                              # 의존성 설치
uvicorn app.main:app --reload --port 8000            # 개발 서버
alembic upgrade head                                 # 마이그레이션 적용
alembic revision --autogenerate -m "description"     # 마이그레이션 생성
ruff check app                                       # 린트
ruff format app                                      # 포맷
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| 관리자 UI | Next.js 14 + TypeScript + Tailwind CSS |
| 위젯 | TypeScript + Vite + Shadow DOM |
| 백엔드 | Python 3.11 + FastAPI + Pydantic + SQLAlchemy 2.0 |
| DB | PostgreSQL + pgvector (Alembic 마이그레이션) |
| AI | OpenAI text-embedding-3-small (1536d) + GPT-4o/4.1 |
| 인증 | 관리자: HTTP-only 세션 쿠키 / 위젯: chatbot_id + 도메인 검증 |
| 배포 | Vercel (web) + Render (api) |

## 아키텍처 핵심 패턴

### 지식 색인 파이프라인

```
파일/웹사이트 등록
  → 텍스트 추출 (PDF: pypdf + OCR fallback, HTML: 자체 파서)
  → _split_text_chunks(chunk_size=900, overlap=120)
  → 각 청크 + 문서제목 → OpenAI embed (text-embedding-3-small)
  → document_chunks 테이블 저장 (embedding=Vector(1536))
  → document_versions.status = "completed"
```

### RAG 검색 파이프라인

```
사용자 질문
  → 질문 임베딩 생성
  → fetch_retrieval_candidates(): 키워드(LIKE) + 코사인 벡터 검색 병렬 실행
  → 점수 계산: keyword(30%) + vector(50%) + corpus(5%) + source(5%) + version(10%)
  → 임계값 필터 (파일 0.32, 웹 0.28, FAQ 0.25) → 상위 5청크
  → build_answer_prompt(): [S1]~[S5] 근거 포함 프롬프트 조립
  → LLM 답변 생성 (SSE 스트리밍 우선)
```

### 검색 게이트 조건

`document_chunks`가 검색에 포함되려면 반드시:
- `Document.status == "active"`
- `DocumentVersion.status == "completed"`
- `DocumentVersion.is_active == True`
- `DocumentVersion.is_search_suppressed == False`

## API 레이어 구조 (FastAPI)

```
app/api/{domain}/          # 라우터 (얇게 유지, 입력 검증만)
app/services/{domain}/     # 비즈니스 로직
app/repositories/{domain}/ # DB 접근 (SQLAlchemy)
app/models/                # SQLAlchemy 모델 (단수형, PascalCase)
app/schemas/               # Pydantic 스키마 (ApiSchema 상속)
```

**규칙**: 라우터 → 서비스 → 리포지터리 단방향. 라우터에 비즈니스 로직 금지.

## 명명 규칙

### Python
- 파일/모듈: `snake_case.py`
- 클래스: `PascalCase`
- Pydantic: `ApiSchema` 상속, camelCase 직렬화 (`model_config = ConfigDict(alias_generator=to_camel)`)
- SQLAlchemy 모델: 단수형 (`Document`, `DocumentVersion`, `DocumentChunk`)

### TypeScript
- React 컴포넌트: `PascalCase.tsx`
- 유틸: `camelCase.ts`
- 훅: `useSomething.ts`
- API 타입: `apps/web/lib/api/` 하위 `*-types.ts`

## 지식 상태 계산 규칙

`KnowledgeItem`에는 두 가지 상태가 있다:
- `status`: DB 기반 계산값 (`_counts_terminal_status()`)
- `displayStatus`: UI 표시용 계산값 (`_compute_display_status()`) — **UI는 이 값 우선 사용**

| displayStatus | 의미 |
|---|---|
| `completed` | chunk > 0 AND embedding > 0 → 검색 가능 |
| `queued` / `processing` | 색인 작업 진행 중 (non-stale) |
| `needs_reindex` | chunk > 0 AND embedding == 0 |
| `stale_failed` | job 시간 초과 (queued 10분 / processing 30분 초과) |
| `failed` | 명시적 실패 |

`canSearch = chunk_count > 0 AND embedding_count > 0`

## 위젯 핵심 규칙

- **Shadow DOM** 사용 — 호스트 페이지 CSS 격리 필수
- 빌드 산출물: `packages/widget/dist/` → `apps/web/public/widget.js` (자동 복사)
- `web dev` 전에 반드시 `build:widget` 실행
- `loadConfig()` 완료 전까지 `ieum-floating-loading` 클래스로 버튼 숨김 (아이콘 flash 방지)
- 호스트 페이지에 `window.IEUMBOTWidget` 전역 노출

## 환경 변수

```bash
# apps/api/.env
API_DATABASE_URL=postgresql://...
API_OPENAI_API_KEY=sk-...
API_SESSION_SECRET=...
API_ALLOWED_ORIGINS=...

# apps/web/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

**임베딩·채팅 모두 OpenAI API 키 필요.** 키 없으면 지식 색인 실패 (`OPENAI_API_KEY_MISSING`).

## 주의사항 (하지 말 것)

- `alembic revision --autogenerate` 결과는 반드시 검토 후 커밋 (자동 생성 결과 그대로 push 금지)
- `document_chunks` 직접 수동 삭제 금지 — 재색인 흐름을 통해 처리
- 위젯 코드에 관리자 콘솔 전용 라이브러리 import 금지 (번들 크기 영향)
- `packages/ui` 변경 시 web + widget 빌드 모두 확인
- 비밀 값(API 키, DB URL, 세션 시크릿) 저장소 커밋 금지

## 상세 문서 참조

| 주제 | 문서 |
|---|---|
| 데이터베이스 스키마 | `docs/10_DATABASE_SCHEMA.md` |
| API 명세 | `docs/11_API_SPEC.md` |
| RAG 설계 | `docs/14_RAG_DESIGN.md` |
| 프롬프트 전략 | `docs/15_PROMPT_STRATEGY.md` |
| 위젯 명세 | `docs/12_WIDGET_SPEC.md` |
| 배포/운영 | `docs/18_DEPLOYMENT_OPERATIONS.md` |
| 보안/개인정보 | `docs/16_SECURITY_PRIVACY_SPEC.md` |

각 앱별 상세는 해당 디렉터리의 `CLAUDE.md` 참조.

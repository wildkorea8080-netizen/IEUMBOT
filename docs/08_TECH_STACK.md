# 08. 기술 스택

이 문서는 이음봇(IEUMBOT)의 MVP와 운영 확장을 고려한 권장 기술 스택을 정의합니다. 기본 방향은 Next.js, FastAPI, PostgreSQL + pgvector, Redis, Docker, Nginx, OpenAI APIs를 중심으로 단순하게 시작하고, 운영 규모가 커질 때 교체 가능한 경계를 유지하는 것입니다.

## 1. 관리자 프런트엔드

### 선택 기술

- Next.js
- React
- TypeScript
- Tailwind CSS 또는 CSS Modules

### 선택 이유

- 관리자 콘솔의 라우팅, 폼, 테이블, 대시보드 구현에 적합합니다.
- React 생태계의 UI 컴포넌트, 폼 검증, 데이터 패칭 도구를 활용할 수 있습니다.
- TypeScript로 API 계약과 화면 상태를 명확히 관리할 수 있습니다.
- Next.js는 정적 자산 배포와 서버 연동 구성이 단순합니다.

### 검토한 대안

- Vite + React
- Remix
- Vue/Nuxt
- 순수 HTML 템플릿

### 트레이드오프

- Next.js는 단순 SPA보다 설정과 빌드 개념이 많습니다.
- 서버 컴포넌트와 클라이언트 컴포넌트 경계를 잘못 잡으면 복잡도가 증가할 수 있습니다.
- MVP에서는 과도한 SSR 최적화보다 관리자 화면의 명확한 상태 관리가 중요합니다.

### 적용 범위

- MVP부터 장기 사용

## 2. 위젯 프런트엔드

### 선택 기술

- React 또는 Preact
- TypeScript
- Vite 기반 번들링
- Shadow DOM 또는 CSS 네임스페이스 격리

### 선택 이유

- 위젯은 독립 번들로 외부 홈페이지에 삽입되어야 하므로 가볍고 명확한 빌드 구성이 필요합니다.
- Preact를 사용하면 번들 크기를 줄일 수 있습니다.
- React를 사용하면 관리자 프런트엔드와 컴포넌트 패턴을 공유하기 쉽습니다.
- Shadow DOM은 호스트 페이지 CSS와 충돌을 줄이는 데 유리합니다.

### 검토한 대안

- Web Components 단독 구현
- Svelte
- vanilla TypeScript
- iframe 기반 위젯

### 트레이드오프

- Shadow DOM은 스타일 격리에 유리하지만 폰트와 접근성 검증을 별도로 신경 써야 합니다.
- iframe은 격리가 강하지만 크기 조정, 호스트 페이지 연동, UX 제어가 불편합니다.
- React는 Preact보다 번들 크기가 커질 수 있습니다.

### 적용 범위

- MVP: Preact 또는 React 중 하나를 선택해 단일 위젯 번들로 시작
- 장기: 번들 크기와 호스트 호환성을 기준으로 Preact 또는 Web Components 전환 검토

## 3. 백엔드

### 선택 기술

- Python
- FastAPI
- Pydantic
- SQLAlchemy 또는 SQLModel
- Uvicorn/Gunicorn

### 선택 이유

- FastAPI는 타입 기반 API 개발과 OpenAPI 문서 생성이 편리합니다.
- Python 생태계는 PDF 처리, RAG, 임베딩, OpenAI 연동에 적합합니다.
- Pydantic으로 요청과 응답 검증을 명확히 정의할 수 있습니다.
- 관리자 API, 위젯 API, 채팅 API를 빠르게 구현할 수 있습니다.

### 검토한 대안

- Node.js + NestJS
- Django
- Go
- Spring Boot

### 트레이드오프

- Python은 CPU 집약 작업에 약하므로 문서 처리 워커와 API 서버를 분리해야 합니다.
- FastAPI는 Django보다 관리자 기능과 ORM 기본 제공이 적습니다.
- 대규모 트래픽에서는 비동기 처리, 커넥션 풀, 워커 수 조정이 중요합니다.

### 적용 범위

- MVP부터 장기 사용

## 4. 데이터베이스

### 선택 기술

- PostgreSQL

### 선택 이유

- 관계형 데이터, JSON 메타데이터, 트랜잭션, 인덱스, 감사 로그 관리에 안정적입니다.
- pgvector 확장을 통해 MVP에서 벡터 검색까지 같은 DB에서 처리할 수 있습니다.
- 조직, 챗봇, 문서, 로그, 설정 데이터를 일관된 트랜잭션으로 관리할 수 있습니다.

### 검토한 대안

- MySQL
- SQLite
- MongoDB
- Supabase 관리형 PostgreSQL

### 트레이드오프

- PostgreSQL 운영에는 백업, 커넥션 관리, 마이그레이션 관리가 필요합니다.
- 대량 로그 분석에는 별도 분석 저장소가 더 적합할 수 있습니다.
- MVP에서는 단일 PostgreSQL로 단순하게 시작하되 로그와 분석 분리를 염두에 둡니다.

### 적용 범위

- MVP부터 장기 사용

## 5. 벡터 검색

### 선택 기술

- PostgreSQL + pgvector

### 선택 이유

- MVP에서 별도 벡터 DB를 운영하지 않아도 됩니다.
- 문서 청크, 메타데이터, 조직 필터, 챗봇 필터를 SQL로 함께 처리할 수 있습니다.
- PostgreSQL 백업과 운영 체계에 포함할 수 있습니다.

### 검토한 대안

- Qdrant
- Weaviate
- Pinecone
- Elasticsearch/OpenSearch vector search

### 트레이드오프

- pgvector는 대규모 벡터 검색 전문 DB보다 확장성과 튜닝 옵션이 제한될 수 있습니다.
- 문서 수와 청크 수가 커지면 인덱스 튜닝과 파티셔닝이 필요합니다.
- 운영 규모가 커지면 Qdrant 또는 Pinecone 같은 전용 벡터 DB 전환을 검토합니다.

### 적용 범위

- MVP: pgvector
- 장기: 규모 증가 시 전용 벡터 DB 검토

## 6. 캐시/큐

### 선택 기술

- Redis
- RQ, Celery, Dramatiq 중 하나의 Python 작업 큐

### 선택 이유

- Redis는 캐시, 속도 제한, 작업 큐 브로커로 사용하기 쉽습니다.
- 문서 처리 작업을 API 요청과 분리할 수 있습니다.
- 위젯 설정 캐시와 임시 세션 상태에도 활용할 수 있습니다.

### 검토한 대안

- RabbitMQ
- Kafka
- PostgreSQL 기반 작업 테이블
- AWS SQS 같은 관리형 큐

### 트레이드오프

- Redis 큐는 Kafka처럼 장기 이벤트 스트림 보관에 적합하지 않습니다.
- 큐 유실에 대비해 문서 처리 작업 상태는 PostgreSQL에도 저장해야 합니다.
- Celery는 기능이 많지만 설정 복잡도가 있습니다. MVP에서는 RQ 또는 Dramatiq도 실용적입니다.

### 적용 범위

- MVP부터 장기 사용
- 대규모 이벤트 스트리밍이 필요하면 별도 메시지 시스템 검토

## 7. 스토리지

### 선택 기술

- MVP: 로컬 파일 스토리지 또는 Docker 볼륨
- 운영: S3 호환 오브젝트 스토리지

### 선택 이유

- PDF 원본, 처리 산출물, 임시 파일을 API 서버와 워커가 공유해야 합니다.
- MVP에서는 로컬 볼륨으로 단순하게 시작할 수 있습니다.
- 운영 환경에서는 백업, 확장성, 내구성을 위해 S3 호환 스토리지가 적합합니다.

### 검토한 대안

- 로컬 디스크만 사용
- PostgreSQL BLOB 저장
- Google Cloud Storage
- Azure Blob Storage
- MinIO

### 트레이드오프

- 로컬 디스크는 배포와 확장 시 파일 공유 문제가 생깁니다.
- DB에 대용량 파일을 저장하면 백업과 성능 부담이 커집니다.
- S3 호환 스토리지는 운영 안정성이 좋지만 접근 권한과 서명 URL 관리가 필요합니다.

### 적용 범위

- MVP: 로컬 또는 MinIO
- 장기: S3 호환 오브젝트 스토리지

## 8. 인증

### 선택 기술

- 관리자: 세션 쿠키 기반 인증
- 비밀번호 해시: bcrypt 또는 argon2
- 권한: 역할 기반 접근 제어
- 위젯: 공개 챗봇 ID + 허용 도메인 검증 + 속도 제한

### 선택 이유

- 관리자 콘솔은 브라우저 기반 업무 도구이므로 HTTP-only Secure 쿠키가 실용적입니다.
- 역할 기반 권한은 문서 운영자, 챗봇 운영자, 보안 관리자, 최고 관리자 구분에 적합합니다.
- 공개 위젯은 사용자 로그인을 요구하지 않으므로 도메인 검증과 속도 제한이 중요합니다.

### 검토한 대안

- JWT access/refresh token
- OAuth/OIDC
- 관리자 이메일 매직 링크
- 외부 IAM 연동

### 트레이드오프

- 세션 쿠키는 CSRF 대응이 필요합니다.
- JWT는 분산 환경에 유리하지만 즉시 폐기와 권한 변경 반영이 더 까다롭습니다.
- 공공기관 SSO나 OIDC는 장기 확장 기능으로 적합합니다.

### 적용 범위

- MVP: 세션 쿠키 + RBAC
- 장기: OIDC, SSO, 2단계 인증 검토

## 9. 배포

### 선택 기술

- Docker
- Docker Compose
- Nginx
- 운영 서버 또는 클라우드 VM

### 선택 이유

- Docker는 Next.js, FastAPI, PostgreSQL, Redis, 워커를 일관된 환경으로 실행할 수 있게 합니다.
- Docker Compose는 MVP와 스테이징 환경 구성에 적합합니다.
- Nginx는 TLS, 리버스 프록시, 정적 파일 배포, 업로드 제한, SSE 프록시 설정을 담당할 수 있습니다.

### 검토한 대안

- Kubernetes
- PaaS
- 서버리스
- 단일 프로세스 배포

### 트레이드오프

- Docker Compose는 운영 규모가 커지면 배포 자동화와 고가용성에 한계가 있습니다.
- Kubernetes는 확장성이 좋지만 MVP에는 운영 복잡도가 큽니다.
- 서버리스는 SSE, 장시간 문서 처리, 파일 업로드에서 제약이 생길 수 있습니다.

### 적용 범위

- MVP: Docker Compose + Nginx
- 장기: 관리형 컨테이너 플랫폼 또는 Kubernetes 검토

## 10. 모니터링

### 선택 기술

- 애플리케이션 로그: 구조화 JSON 로그
- 지표: Prometheus 호환 메트릭
- 대시보드: Grafana
- 오류 추적: Sentry 또는 OpenTelemetry 기반 도구

### 선택 이유

- JSON 로그는 요청 ID, 조직 ID, 챗봇 ID, 오류 코드를 구조화해 검색하기 쉽습니다.
- Prometheus와 Grafana는 API 응답 시간, 오류율, 큐 적체량, 문서 처리 성공률을 추적하기 좋습니다.
- Sentry는 프런트엔드와 백엔드 오류 추적에 빠르게 적용할 수 있습니다.

### 검토한 대안

- ELK Stack
- Loki
- Datadog
- CloudWatch
- 단순 파일 로그

### 트레이드오프

- Prometheus/Grafana 운영에는 별도 구성과 저장소가 필요합니다.
- Sentry 같은 SaaS는 개인정보 필터링 설정이 중요합니다.
- MVP에서는 최소 로그와 기본 지표부터 시작하고, 운영 단계에서 알림을 강화합니다.

### 적용 범위

- MVP: 구조화 로그 + 기본 대시보드
- 장기: OpenTelemetry, 알림, 분산 추적 확대

## 11. 테스트

### 선택 기술

- 백엔드 단위 테스트: pytest
- 백엔드 API 테스트: pytest + HTTPX
- 프런트엔드 단위 테스트: Vitest
- 프런트엔드 컴포넌트 테스트: Testing Library
- E2E 테스트: Playwright
- 정적 검사: TypeScript, ESLint, Ruff 또는 Black

### 선택 이유

- pytest는 FastAPI와 Python 도메인 로직 테스트에 적합합니다.
- HTTPX는 FastAPI 테스트 클라이언트와 잘 맞습니다.
- Vitest는 Next.js와 위젯 컴포넌트 테스트에 빠르게 사용할 수 있습니다.
- Playwright는 위젯 삽입, 관리자 콘솔, 모바일 뷰포트 검증에 유리합니다.

### 검토한 대안

- Jest
- Cypress
- unittest
- Selenium
- Postman/Newman

### 트레이드오프

- Playwright는 브라우저 설치와 CI 시간이 필요합니다.
- E2E 테스트를 과도하게 늘리면 유지보수 비용이 커집니다.
- MVP에서는 핵심 사용자 흐름 중심으로 E2E를 제한하고, 백엔드 도메인 로직 테스트를 탄탄히 가져갑니다.

### 적용 범위

- MVP부터 장기 사용

## 12. OpenAI API 연동

### 선택 기술

- OpenAI Responses API 또는 Chat Completions 계열 답변 생성 API
- OpenAI Embeddings API

### 선택 이유

- 문서 기반 답변 생성과 임베딩 생성에 필요한 기능을 빠르게 구현할 수 있습니다.
- 스트리밍 응답을 통해 SSE 기반 사용자 경험을 제공할 수 있습니다.
- 모델 교체가 가능하도록 API 호출 계층을 내부 서비스로 감싸는 구조가 적합합니다.

### 검토한 대안

- 자체 호스팅 오픈소스 LLM
- Azure OpenAI
- Anthropic
- Google Gemini
- 국내 LLM API

### 트레이드오프

- 외부 API 의존성이 있으므로 장애, 비용, 지연 시간 관리가 필요합니다.
- 공공기관 요구사항에 따라 데이터 처리 위치와 보관 정책 검토가 필요할 수 있습니다.
- 장기적으로 모델 공급자 추상화 계층을 두면 교체 비용을 줄일 수 있습니다.

### 적용 범위

- MVP: OpenAI API 직접 연동
- 장기: 모델 공급자 추상화와 대체 공급자 검토

## 13. 권장 MVP 조합

MVP에서 우선 적용할 조합은 다음과 같습니다.

- 관리자 프런트엔드: Next.js + TypeScript
- 위젯 프런트엔드: Preact 또는 React + TypeScript + Vite
- 백엔드: FastAPI + Pydantic + SQLAlchemy
- 데이터베이스: PostgreSQL
- 벡터 검색: pgvector
- 캐시/큐: Redis + RQ 또는 Dramatiq
- 스토리지: 로컬 볼륨 또는 MinIO
- 인증: HTTP-only 세션 쿠키 + RBAC
- 배포: Docker Compose + Nginx
- AI 연동: OpenAI Embeddings + 답변 생성 API
- 모니터링: 구조화 JSON 로그 + 기본 메트릭
- 테스트: pytest, Vitest, Playwright

## 14. 장기 전환 후보

운영 규모와 요구사항이 커질 경우 다음 전환을 검토합니다.

- 로컬/MinIO 스토리지 -> S3 호환 관리형 오브젝트 스토리지
- Docker Compose -> 관리형 컨테이너 플랫폼 또는 Kubernetes
- pgvector 단일 테이블 -> 파티셔닝 또는 전용 벡터 DB
- 기본 세션 인증 -> OIDC/SSO/2FA
- 기본 로그 -> OpenTelemetry 기반 분산 추적
- 관리자 수동 운영 -> 알림, 승인 워크플로우, 자동 리포팅

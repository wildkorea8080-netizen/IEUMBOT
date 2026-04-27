# 10_DATABASE_SCHEMA.md

## 1. 목적
이 문서는 운영 통제형 공공 챗봇(IEUMBOT) MVP를 위한 PostgreSQL(+pgvector) 스키마를 정의한다.  
중점은 다음 5가지 데이터 구조를 DB 수준에서 보장하는 것이다.

1. 검색 제어(search control)
2. 답변 검증(answer validation)
3. 가드레일(guardrails)
4. 대화 추적(conversation trace)
5. 에스컬레이션(escalation)

## 2. 명명 규칙(정합성 기준)
- DB 테이블/컬럼: `snake_case`
- API 직렬화 키: `camelCase`
- FK 표준:
  - `organization_id`
  - `chatbot_id`
  - `document_id`
  - `document_version_id`
  - `session_id`
  - `message_id`
- 코퍼스 표준 용어:
  - `corpus_domain` (값: `policy_programs`, `procedures_forms`, `notices`, `faq`, `internal_scripts`, `contacts_hours`)

## 3. 핵심 엔터티(기존 범위)
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

## 4. 운영 통제 기능과 매핑되는 컬럼 보완

### 4.1 chatbot_settings (검색 제어 + 검증 + 가드레일)
추가/명시 컬럼:
- `answer_priority_policy jsonb not null`
  - 예: `["uploaded_document","official_website_indexed","official_notice","external_web_exception"]`
- `external_search_exception_policy jsonb not null`
  - 예: 허용 도메인/조건/비활성 기본값
- `corpus_domain_config jsonb not null`
  - 도메인별 사용 여부/가중치
- `official_web_index_schedule jsonb not null`
  - 정기 색인 주기/시간대
- `evidence_threshold numeric(4,3) not null`
  - 생성 허용 임계치
- `answer_validation_policy jsonb not null`
  - 근거 충분성/충돌/최신성 체크 규칙
- `no_guess_policy jsonb not null`
  - 금지 주제(자격/법해석/금액/마감/결과예측) 규칙
- `guardrail_policy jsonb not null`
  - 안전 응답/차단/에스컬레이션 규칙

인덱스:
- `idx_chatbot_settings_org_status` (`organization_id`, `status`)

### 4.2 documents / document_versions / document_chunks (구조 보존)
문서 전처리 보존 필드:
- `document_versions.effective_date date null`
- `document_versions.issuing_department varchar(150) null`
- `document_versions.audience text null`
- `document_versions.exceptions_text text null`
- `document_chunks.section_title text null`
- `document_chunks.page_number integer null`
- `document_chunks.corpus_domain varchar(40) not null`

인덱스:
- `idx_document_chunks_org_chatbot_domain` (`organization_id`, `chatbot_id`, `corpus_domain`)
- `idx_document_chunks_version_order` (`document_version_id`, `chunk_index`)
- pgvector index on `document_chunks.embedding`

### 4.3 chat_messages (대화 추적 + 검증 결과 + 에스컬레이션)
추가/명시 컬럼:
- `normalized_query text null`
- `query_decomposition jsonb not null default '[]'::jsonb`
- `retrieval_trace jsonb not null default '{}'::jsonb`
- `answer_validation jsonb not null default '{}'::jsonb`
  - evidence score, sufficiency, missing reasons
- `guardrail_trace jsonb not null default '{}'::jsonb`
  - no-guess trigger, blocked reason
- `source_priority_path text[] not null default '{}'`
- `escalation jsonb not null default '{}'::jsonb`
  - escalation type, department, contact, hours

인덱스:
- `idx_chat_messages_session_created` (`session_id`, `created_at`)
- `idx_chat_messages_org_chatbot_created` (`organization_id`, `chatbot_id`, `created_at desc`)
- `idx_chat_messages_no_guess` on expression `(guardrail_trace->>'noGuessTriggered')`

### 4.4 citations (문서 버전 일관성)
명시 규칙:
- `document_version_id`는 nullable 가능하나, `source_type='document_chunk'`일 때는 채우는 것을 원칙으로 한다.
- 인용 표준:
  - `title`
  - `page_number`
  - `source_url`
  - `snippet_masked`

### 4.5 ingestion_jobs (정기 색인 추적)
명시 컬럼/값:
- `job_type`: `document_ingestion`, `document_reindex`, `web_sync`
- `status`: `queued`, `running`, `succeeded`, `failed`, `cancelled`
- `web_source_id` 연계 필수(웹 동기화 작업 시)

## 5. 멀티테넌시 기준
- 모든 운영 데이터 질의에 `organization_id` 필터를 기본 강제한다.
- 챗봇 범위 데이터는 `organization_id + chatbot_id`를 동시 조건으로 사용한다.

## 6. 제약 조건 정리(일부 핵심)
- `admins`: unique (`organization_id`, `email`)
- `document_versions`: unique (`document_id`, `version_number`)
- `chat_sessions`: unique (`organization_id`, `session_token`)
- `document_chunks`: unique (`document_version_id`, `chunk_index`)

## 7. 일관성 체크 포인트
- API의 `organizationId`, `chatbotId`, `documentVersionId`는 DB의 `organization_id`, `chatbot_id`, `document_version_id`와 1:1 매핑된다.
- `corpusDomain`(API) ↔ `corpus_domain`(DB) 값을 동일 enum 집합으로 유지한다.

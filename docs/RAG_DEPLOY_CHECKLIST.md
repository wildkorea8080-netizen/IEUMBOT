# RAG Deploy Checklist

IEUMBOT RAG 품질 개선 사항을 운영에 반영하기 전 확인해야 하는 절차입니다. 이 문서는 배포 전 수동 점검, 자동 평가, 롤백 판단 기준을 함께 다룹니다.

## 관련 파일

- 평가 데이터: [`apps/api/evals/rag_benchmark.jsonl`](../apps/api/evals/rag_benchmark.jsonl)
- 평가 스크립트: [`apps/api/evals/run_rag_eval.py`](../apps/api/evals/run_rag_eval.py)
- 평가 사용법: [`apps/api/evals/README.md`](../apps/api/evals/README.md)
- 품질 리포트 화면: `/admin/quality-report`

## 배포 전 필수 체크리스트

### 1. 지식 재색인 상태

- [ ] 운영 대상 챗봇의 웹사이트 지식을 재색인한다.
- [ ] 재색인 상태가 `completed`인지 확인한다.
- [ ] `chunk_count > 0`인지 확인한다.
- [ ] `embedding_count == chunk_count`인지 확인한다.
- [ ] `embedding_count == 0`인 지식이 있으면 배포하지 않는다.
- [ ] 재색인 실패 시 기존 정상 chunk가 보호되는지 확인한다.

### 2. 관리자 test-chat 회귀 확인

관리자 화면에서 `/admin/test-chat` 또는 `/admin/chatbots/{chatbotId}/test-chat`를 사용해 아래 질문을 확인한다.

질문:

```text
융자지원 조건은?
```

필수 확인값:

- [ ] `outcome = answered`
- [ ] `fallbackReason = NONE`
- [ ] `retrieval.usedInPromptCount >= 1`
- [ ] `retrieval.topScore >= 0.40`
- [ ] `llm.executed = true`
- [ ] 답변에 `융자`, `자부담`, `70%`, `연리`, `담보` 중 주요 조건이 포함된다.
- [ ] citation 또는 상위 chunk에 `이용약관`, `사이트맵`, `TEL`, `회원사` 중심 내용이 반복되지 않는다.

### 3. 품질 리포트 화면 확인

- [ ] `/admin/quality-report`에 접속할 수 있다.
- [ ] 총 대화 수, 답변 성공률, fallback 비율, 평균 응답시간, 평균 topScore, LLM 실행률 카드가 표시된다.
- [ ] 최근 실패 질문, 낮은 점수 질문, citation 없는 답변, fallback reason TOP 표가 표시된다.
- [ ] 데이터가 없는 환경에서는 `아직 분석할 대화 데이터가 없습니다.` 문구가 표시된다.

## 자동 평가 실행

루트에서 실행:

```bash
pnpm eval:rag -- --mode http --base-url https://<api-host>/api --chatbot-id <CHATBOT_ID> --admin-token <ADMIN_ACCESS_TOKEN>
```

로컬 API 서버를 대상으로 실행:

```bash
pnpm eval:rag -- --mode http --base-url http://localhost:8000/api --chatbot-id <CHATBOT_ID> --admin-token <ADMIN_ACCESS_TOKEN>
```

API 프로세스와 같은 DB/환경을 사용하는 로컬 내부 파이프라인 실행:

```bash
IEUMBOT_CHATBOT_ID=<CHATBOT_ID> pnpm eval:rag -- --mode internal
```

스크립트 자체 확인:

```bash
pnpm eval:rag -- --help
pnpm eval:rag -- --mode dry-run --limit 2
```

기본 결과 파일:

```text
apps/api/evals/results/latest_rag_eval.json
```

## 운영 배포 전 통과 기준

평가 결과의 `summary.quality_gate.passed`가 `true`여야 한다.

- `pass_rate >= 80%`
- `fallback_rate <= 20%`
- 인사 카테고리 성공률 `100%`
- 융자지원 카테고리 `pass_rate >= 80%`
- `avg_latency_ms <= 15000`

추가로 실패 케이스를 확인한다.

- `failed_cases`에 `"융자지원 조건은?"`이 포함되면 배포하지 않는다.
- `should_fallback=false` 질문에서 fallback이 반복되면 retrieval threshold, chunk 품질, embedding 상태를 먼저 확인한다.
- `avg_top_score`가 급락하면 재색인 결과와 상위 chunk preview를 확인한다.

## 운영 반영 순서

1. `staging`에 배포한다.
2. 웹사이트 지식을 재색인한다.
3. 지식 상태와 `chunk_count`, `embedding_count`를 확인한다.
4. `pnpm eval:rag`로 RAG benchmark를 실행한다.
5. `/admin/test-chat`에서 `"융자지원 조건은?"`를 수동 확인한다.
6. `/admin/quality-report` 접속과 지표 표시를 확인한다.
7. 기준을 통과하면 `main`으로 병합하고 운영 배포한다.
8. 운영 배포 후 같은 benchmark를 한 번 더 실행한다.

## 롤백 절차

### Vercel 웹 롤백

1. Vercel Dashboard에서 해당 프로젝트의 Deployments로 이동한다.
2. 직전 정상 배포를 선택한다.
3. `Promote to Production` 또는 rollback 기능으로 이전 배포를 운영에 재지정한다.
4. `/admin/quality-report`, `/admin/test-chat` 접속을 다시 확인한다.

### Render API 롤백

1. Render Dashboard에서 API service의 Events 또는 Deploys로 이동한다.
2. 직전 정상 deploy를 선택한다.
3. Render의 rollback/redeploy previous deploy 기능을 사용한다.
4. `/health`와 `/admin/quality-report` API 응답을 확인한다.

### DB migration 롤백 주의사항

- 이번 RAG 품질 개선 단계는 DB migration 없이 동작해야 한다.
- 운영 배포에 migration이 포함된 다른 변경이 섞여 있으면 rollback 전에 migration 영향 범위를 별도 확인한다.
- 이미 적용된 destructive migration은 애플리케이션 롤백만으로 복구되지 않을 수 있다.
- vector/chunk 테이블을 수동 정리하기 전에 백업과 영향 챗봇 범위를 확인한다.

### 지식 재색인 실패 시

- 재색인 실패 상태와 `error_message`를 먼저 확인한다.
- `embedding_count == 0`이면 API key, embedding model, vector 저장 오류를 확인한다.
- 기존 정상 chunk 보호 정책이 유지되는지 확인한다.
- 실패한 새 색인이 기존 정상 검색 결과를 덮어썼다면 직전 백업 또는 이전 배포 기준으로 재색인한다.

## 브랜치 전략

- `main`: 운영 배포 브랜치. 검증된 변경만 병합한다.
- `staging`: 운영 전 통합 검증 브랜치. RAG benchmark와 관리자 화면 확인을 수행한다.
- `qa/rag-audit`: RAG 품질 실험과 threshold, chunking, retrieval policy 검증용 브랜치.
- `feature/*`: 기능 개발 브랜치. 기능 단위 PR 후 `staging`에서 통합 검증한다.

## 배포 중단 기준

다음 중 하나라도 발생하면 운영 반영을 중단한다.

- 지식 재색인 상태가 `failed` 또는 장시간 `queued/processing`에 머문다.
- `chunk_count == 0`
- `embedding_count != chunk_count`
- `"융자지원 조건은?"`가 fallback 처리된다.
- `usedInPromptCount == 0`
- RAG benchmark quality gate가 실패한다.
- `/admin/quality-report` 화면 또는 API가 5xx를 반환한다.

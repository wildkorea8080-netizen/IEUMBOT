# IEUMBOT RAG Evals

IEUMBOT 답변 품질을 배포 전에 정량 점검하기 위한 최소 평가셋과 실행 스크립트입니다. 운영 DB schema, API route, prompt, citation 구조는 변경하지 않고 관리자 test-chat endpoint 또는 로컬 내부 파이프라인을 호출합니다.

## 파일

- `rag_benchmark.jsonl`: 40개 평가 질문
- `run_rag_eval.py`: 평가 실행 스크립트
- `results/latest_rag_eval.json`: 기본 결과 저장 위치

## 평가셋 구성

- 인사: 5개
- 융자지원: 10개
- 사업신고: 5개
- 국내반입/투자촉진: 5개
- 교육/해외인턴: 5개
- 문의처: 3개
- 범위 밖 질문: 5개
- 모호한 질문: 2개

각 row는 다음 필드를 사용합니다.

```json
{
  "id": "q001",
  "question": "융자지원 조건은?",
  "category": "loan",
  "expected_keywords": ["융자", "자부담", "70%", "연리", "담보"],
  "expected_source_terms": ["자부담 비율", "융자신청"],
  "should_fallback": false
}
```

## 실행 방법

HTTP 모드는 실행 중인 API 서버의 관리자 test-chat endpoint를 호출합니다.

```bash
cd apps/api
python evals/run_rag_eval.py \
  --mode http \
  --base-url http://localhost:8000/api \
  --chatbot-id <CHATBOT_ID> \
  --admin-token <ADMIN_ACCESS_TOKEN>
```

환경변수로도 실행할 수 있습니다.

```bash
cd apps/api
IEUMBOT_API_BASE_URL=http://localhost:8000/api \
IEUMBOT_CHATBOT_ID=<CHATBOT_ID> \
IEUMBOT_ADMIN_TOKEN=<ADMIN_ACCESS_TOKEN> \
python evals/run_rag_eval.py
```

로컬 DB와 설정을 사용해 내부 파이프라인을 직접 호출할 수도 있습니다.

```bash
cd apps/api
IEUMBOT_CHATBOT_ID=<CHATBOT_ID> python evals/run_rag_eval.py --mode internal
```

스크립트 자체 동작만 확인하려면 dry-run을 사용합니다.

```bash
cd apps/api
python evals/run_rag_eval.py --mode dry-run --limit 2
```

## 결과 해석

기본 결과는 `apps/api/evals/results/latest_rag_eval.json`에 저장됩니다.

요약 필드:

- `total`: 실행한 평가 문항 수
- `pass_count`: 통과 문항 수
- `pass_rate`: 전체 통과율
- `fallback_rate`: 전체 fallback 비율
- `non_fallback_fallback_rate`: 답변해야 하는 질문 중 fallback 발생 비율
- `avg_latency_ms`: 평균 응답 시간
- `avg_top_score`: retrieval top score 평균
- `failed_cases`: 실패 문항 요약
- `by_category`: 카테고리별 통과율

각 문항은 answer, trace, citations, expected keyword hit, source term hit, `retrieval.usedInPromptCount`, `topScore`, `llmExecuted`, latency를 함께 저장합니다.

## 배포 전 품질 체크 기준

배포 전 `summary.quality_gate.passed`가 `true`인지 확인합니다.

- 전체 `pass_rate >= 80%`
- 인사 카테고리 성공률 `100%`
- 융자지원 카테고리 `pass_rate >= 80%`
- `should_fallback=false` 질문의 fallback rate `<= 20%`
- `avg_latency_ms <= 15000`

실패 문항은 `failed_cases`에서 먼저 확인하고, 해당 문항의 `trace.retrieval.chunks`, `fallbackReason`, `llmExecuted`, citation을 함께 봅니다.

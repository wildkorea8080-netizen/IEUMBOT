# API 안정화 런북 (반복 다운 대응)

## 증상
- `api.deepsecu.co.kr`가 간헐적으로 응답 불능 → 콘솔이 "인증실패". 재배포하면 복구되며 **반복**.
- TLS까지는 되지만 **DB를 안 쓰는 `/api/health`(liveness)조차 무응답** → **API 프로세스 정지/포화** (트레이스백 없음 → 코드 크래시 아님).

## 근본 원인 (구조적)
`USE_ARQ_WORKER=false` + uvicorn 단일 워커 → **무거운 작업이 전부 API 프로세스 하나에** 몰림:
- 매시간 웹소스 동기화(`sync_all_due_web_sources`, 동기) = **인프로세스 APScheduler** (`app/main.py`)
- 지식 색인/재색인(PDF/HWP 추출·임베딩) = **BackgroundTasks**(같은 프로세스)
- 채팅 답변마다 OpenAI/Anthropic 호출(read 60s×재시도)

→ 메모리·스레드·DB커넥션이 소진되면 liveness까지 멈춤. **가장 유력한 방아쇠 = OOM(메모리 부족).**

---

## 처방 순서: B(자가복구) → A(근본치료)

### B. 자가복구 (Coolify 설정 — 코드 변경 불필요, 즉시)
컨테이너에는 이미 `HEALTHCHECK`가 심어져 있음(`infra/docker/api.Dockerfile`, `/api/health`). Coolify에서:

1. **Health Check** (API 리소스)
   - Path `/api/health` · GET · 기대 `200`
   - Interval `30s` · Timeout `5s` · Unhealthy threshold(연속 실패) `3` · Start period `60s`
2. **Restart policy** `always`(unless-stopped) + **unhealthy 시 자동 재시작 활성화**
3. **Memory 한도 상향**: 현재 한도 확인 → 평소 최대 사용량의 **약 2배**로. (OOM이면 이것만으로 빈도 급감)

> 효과: 멈춰도 관리자 개입 없이 자동 복구. 단 "완치"가 아니라 방어막(주기적 재시작 중 진행 요청/색인은 끊길 수 있음).

### A. ARQ 워커 분리 (근본치료 — 이미 구현됨, "켜기"만)
필요한 코드/이미지 전부 존재: `infra/docker/worker.Dockerfile`(`CMD arq app.workers.main.WorkerSettings`), docker-compose `worker` 서비스, `app/workers/main.py`(재색인 함수 + 매시 정각 `sync_due_web_sources` cron).

**주의**: `USE_ARQ_WORKER=true`로 켜면 API는 색인을 Arq(Redis)로 넘기고 인프로세스 스케줄러를 끔 → **워커가 반드시 떠 있어야** 함(아니면 작업이 큐에 쌓여 처리 안 됨). env와 워커를 **동시에** 적용.

1. **Env**(API·워커 공통): `USE_ARQ_WORKER=true` (`API_REDIS_URL`은 이미 정상)
2. **⚠️ 공유 볼륨 (필수)**: 파일 저장이 `local`이라 업로드 파일/추출 텍스트가
   `apps/api/storage/knowledge`(컨테이너 경로 `/app/apps/api/storage/knowledge`)에
   저장되고 **재색인이 이 파일을 다시 읽음**. 따라서 API와 워커가 **같은 저장소를
   공유**해야 파일 재색인이 성공한다.
   - API·워커 **양쪽 모두** 영구 볼륨을 `/app/apps/api/storage` 에 마운트(같은 볼륨).
   - (웹소스 동기화·크롤은 파일 불필요 → 볼륨 없이도 됨. 볼륨은 **파일 문서 재색인**용.)
   - 장기적으로는 파일 저장을 오브젝트 스토리지(S3/MinIO)로 옮기면 볼륨 공유 불필요.
3. **워커 컨테이너 실행**: API와 **같은 코드/이미지/env**, 시작 명령만 `arq app.workers.main.WorkerSettings`
   - Coolify: 같은 저장소로 **두 번째 리소스**를 만들어 Dockerfile을 `infra/docker/worker.Dockerfile`로 지정(또는 compose의 `worker` 서비스 배포). 도메인·포트 없음.
4. **검증**
   - 워커 로그에 arq 시작 메시지 + cron 등록
   - 지식 **재색인** 1회 → 워커 로그에 `[ARQ_TASK] process_reindex_job started` → 목록에서 완료 확인 (파일 문서로 검증 → 공유 볼륨 확인)
   - 매시 정각 웹동기화가 **워커에서** 도는지(`[ARQ_CRON] sync_due_web_sources`)
   - API 로그에 `[SCHEDULER] use_arq_worker=true — APScheduler 비활성` (인프로세스 스케줄러 꺼짐)
   - API 프로세스는 이제 요청/응답만 → 무거운 작업으로 안 죽음

---

## 원인 확정 체크리스트 (Coolify)
1. **메모리 그래프**: 다운 시각에 한도 근접/`OOMKilled` 여부 → OOM 확정
2. **타이밍 상관**: 다운이 **매시 정각(웹동기화)** / **지식 등록 직후** / **채팅 몰릴 때** 와 겹치는지
3. **멈추기 직전 로그**: `[WEB_CRAWL]` / `[EMBEDDING]` / `[INGEST]` 활동 후 침묵

## 참고: 코드에 이미 있는 안전장치
- LLM 호출 타임아웃: connect 5s / read 60s / retry 2 (`answer_generation_service.py`)
- 웹 fetch 타임아웃: `web_fetcher.py` httpx.Timeout
- DB: `pool_pre_ping=True` (죽은 커넥션 자동 감지)
- readiness ping 타임아웃 1s (`health.py`)

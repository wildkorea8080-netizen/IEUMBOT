# 탐색 메뉴(2단 가이드 메뉴) 설계

작성일: 2026-08-03
상태: 승인됨 (구현 계획 작성 대기)

## 1. 배경

공공기관 챗봇 이용자의 상당수는 **무엇을 물어봐야 할지 모른 채** 위젯을 연다. 국민비서 구삐,
온다비(한국자산관리공사) 등 공공 챗봇은 이 문제를 **버튼 기반 계층 탐색**으로 푼다 —
분야를 고르면 하위 주제 버튼이 나오고, 최종 선택에서 답변이 나온다.

IEUMBOT에는 이 탐색 계층이 없다. 부품은 있으나 연결되지 않은 상태다.

| 요소 | 현재 상태 |
|---|---|
| `quick_actions` 테이블 | 존재 (평면 구조) |
| 위젯의 버튼 렌더 + 클릭 시 질문 전송 | 동작함 (`widget-app.ts` `renderQuickActions`) |
| 관리자 CRUD API | **없음** |
| 관리 화면 | **스텁만** (`/admin/quick-actions` — "화면 골격입니다") |
| 계층(parent/child) | **없음** |

즉 현재 퀵액션은 DB에 직접 INSERT하지 않으면 등록할 수 없다.

## 2. 목표 / 비목표

**목표**
- 2단 탐색 메뉴(대분류 → 질문)를 위젯에서 제공한다.
- 관리자가 콘솔에서 메뉴를 직접 등록·수정·정렬할 수 있다.
- 메뉴 버튼은 **답변이 아니라 질문을 담는다** — 답변은 기존 RAG/FAQ 파이프라인이 생성한다.
- 기존 평면 퀵액션 데이터는 동작이 바뀌지 않는다.

**비목표 (이번 범위 밖)**
- 캐러셀·페이지네이션 (버튼이 많으면 세로 나열)
- 3단 이상 깊이
- 노드별 클릭 통계
- 메뉴 노드에 고정 답변 저장 (→ FAQ로 대체, 4절 참조)

## 3. 데이터 모델

### 3.1 스키마 변경

`quick_actions` 테이블에 컬럼 2개 추가:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `parent_id` | `UUID NULL`, FK → `quick_actions.id` | NULL이면 대분류, 값이 있으면 그 대분류의 자식 |
| `description` | `VARCHAR(300) NULL` | 카드 부제. 선택 입력 |

인덱스: `(chatbot_id, parent_id, sort_order)` — 트리 조회 정렬용.

### 3.2 `action_type` 값

| 값 | 역할 | 위젯 동작 |
|---|---|---|
| `category` | 대분류 (자식을 가짐) | 클릭 시 자식 버튼 카드를 대화에 표시 |
| `question` | 질문 버튼 (리프) | `payload`(비어 있으면 `label`)를 질문으로 전송 |
| `link` | 외부 링크 (리프) | 새 창으로 URL 열기 |

`category`는 `parent_id`가 NULL이어야 하고, `question`/`link`는 자식을 가질 수 없다.

**`display_location`**: 기존 컬럼을 그대로 둔다. 대분류(`category`)는 `welcome`을 쓰고,
자식 노드는 카드 안에서 렌더되므로 이 값을 참조하지 않는다(기본값 `welcome` 유지).

**자식이 없는 `category`**: 위젯이 시작화면에 표시하지 않는다. 눌러도 빈 카드만 나오는
상태를 사용자에게 노출하지 않기 위함이다. 관리 화면에서는 "자식 없음" 경고를 함께 보여준다.

### 3.3 깊이 제한

**2단 고정.** 서버에서 검증한다:
- 생성/수정 시 `parent_id`가 가리키는 노드의 `parent_id`가 NULL이 아니면 `400 MENU_DEPTH_EXCEEDED`
- `category`에 `parent_id`를 지정하면 `400 CATEGORY_CANNOT_HAVE_PARENT`

### 3.4 무회귀 보장

기존 행은 모두 `parent_id = NULL`이고 `action_type`이 `question` 또는 `link`다.
위젯은 **`category`가 하나도 없으면 기존과 동일하게** 시작화면에 평면 버튼을 그린다.
따라서 마이그레이션만 적용하고 데이터를 넣지 않으면 현재 동작이 100% 유지된다.

### 3.5 마이그레이션

Alembic 리비전 1개. `down_revision = "20260716_0048"` (현재 head).
`upgrade()`에서 컬럼 2개 + 인덱스 추가, `downgrade()`에서 제거.
기존 행에 대한 데이터 변환은 없다(둘 다 NULL 허용).

## 4. 동작 흐름

```
위젯 열기
  → 시작화면: category 버튼들  [체육시설] [문화·복지] [주차시설] [공단소개]

'주차시설' 클릭
  → 사용자 말풍선: #주차시설
  → 봇 카드:
      ┌ 주차시설 ─────────────────┐
      │ 공영주차장 이용 안내        │   ← description
      │ [주차요금] [정기권]         │   ← 자식 question 버튼
      │ [거주자우선] [부정주차]      │
      │ ↑ 처음으로                 │
      └──────────────────────────┘

'주차요금' 클릭
  → 사용자 말풍선: #주차요금
  → 기존과 동일한 RAG 답변 (추천질문·CTA·출처 포함)
  → 답변 하단: [↑ 상위 메뉴로] [↑ 처음으로]
```

**탐색 상태는 위젯(클라이언트)에만 둔다.** 서버는 현재 위치를 알 필요가 없다 —
버튼 클릭은 결국 평범한 질문 전송이므로 기존 채팅 API가 그대로 처리한다.

### 고정 답변이 필요한 경우

메뉴 노드에 답변을 저장하지 않는다. 특정 항목의 문구를 정확히 통제하고 싶으면
**해당 질문을 FAQ에 등록**한다. 버튼이 던진 질문이 FAQ 시맨틱 매칭(≥0.82)에 걸려
등록된 답변이 그대로 나간다. 별도 컬럼·별도 렌더 경로가 필요 없다.

## 5. API

### 5.1 관리자 API (신규)

`app/api/admin/quick_actions_router.py` + `app/services/admin/quick_action_service.py`
+ `app/repositories/admin/quick_action_repository.py`.
기존 `faq_router.py`의 CRUD 패턴을 따른다(라우터는 얇게, 서비스에 로직, 리포지터리에 DB).

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/admin/quick-actions?chatbotId=` | 트리 반환(대분류 + 중첩된 자식) |
| POST | `/api/admin/quick-actions` | 노드 생성 |
| PATCH | `/api/admin/quick-actions/{id}` | 노드 수정 |
| DELETE | `/api/admin/quick-actions/{id}` | 소프트 삭제. 대분류면 자식도 함께 |
| POST | `/api/admin/quick-actions/reorder` | `[{id, parentId, sortOrder}]` 일괄 저장 |

권한: 기존 `require_institution_admin_auth` + `ensure_chatbot_in_scope`로
타 기관 챗봇 접근을 차단한다.

### 5.2 위젯 API (필드 추가)

`GET /api/widget/config/{chatbotId}` 응답의 `quickActions[]`에 필드 2개 추가:

```json
{ "id": "...", "label": "주차요금", "actionType": "question",
  "payload": "주차요금이 얼마인가요?", "url": null,
  "displayLocation": "welcome", "sortOrder": 1,
  "parentId": "...", "description": null }
```

기존 위젯 번들은 모르는 필드를 무시하므로 하위호환된다.

## 6. 위젯 변경

`packages/widget/src/bootstrap/widget-app.ts`

- `renderQuickActions()`: `category`가 존재하면 **대분류만** 시작화면에 노출.
  `category`가 없으면 현행대로 `displayLocation === "welcome"` 평면 렌더(무회귀).
- 신규 `renderMenuCard(node, children)`: 제목 + 설명 + 자식 버튼 + `↑ 처음으로`.
- 버튼 클릭 시 **선택을 사용자 말풍선으로 에코**(`#라벨`)한 뒤 동작 수행.
- 답변 메시지 하단에 `[↑ 상위 메뉴로] [↑ 처음으로]` — 현재 탐색 위치가 있을 때만.
- 탐색 상태(`currentCategoryId`)는 WidgetApp 인스턴스 필드로 관리.

## 7. 관리 화면

`apps/web/app/admin/quick-actions/page.tsx` (기존 스텁 대체)

- 사이드바 **AI 설정 → `탐색 메뉴`** 항목 신규 추가(조건별 답변 설정 아래)
- 대분류 목록 → 펼치면 자식 질문 목록
- 각 노드: 라벨 / 설명 / 유형(question·link) / 질문문구(payload) 또는 URL / 사용여부
- 추가·수정·삭제·순서 변경(위/아래 버튼)
- 저장 시 `reorder` + 개별 PATCH 조합

## 8. 테스트

Python(`apps/api/tests/`):
- 깊이 제한: 자식의 자식 생성 시 400
- `category`에 `parent_id` 지정 시 400
- 소프트 삭제: 대분류 삭제 시 자식도 `is_deleted=True`
- 권한: 타 기관 챗봇 id로 접근 시 차단
- 무회귀: `category`가 없는 기존 데이터의 위젯 config 응답이 기존 형태 유지

## 9. 롤아웃

1. 마이그레이션 적용(데이터 없음 → 동작 변화 없음)
2. 관리 화면에서 **강동구도시관리공단** 챗봇에 대분류 4개 + 질문 4~6개씩 등록
3. `igangdong_test.html`에서 탐색 흐름 확인
4. 클릭률·완결률을 보고 3단 확장·캐러셀 필요 여부 판단

## 10. 향후 확장 (이번 범위 밖)

- 캐러셀·페이지네이션 (버튼 6개 초과 시)
- 3단 이상 깊이 — 깊이 제한 상수만 완화하면 데이터 모델은 그대로 수용 가능
- 노드별 클릭 로그 → 인기 경로 분석

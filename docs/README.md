# IEUMBOT 설계 문서 인덱스

> **Claude Code 사용 시**: 코드 작업에는 `/CLAUDE.md`와 각 앱의 `CLAUDE.md`를 참조하세요.
> 이 디렉터리는 **설계 의도·요구사항 상세 스펙** 전용입니다.

## 빠른 참조 (작업별 추천 문서)

| 작업 | 참조 문서 |
|---|---|
| DB 모델/스키마 변경 | `10_DATABASE_SCHEMA.md` |
| API 엔드포인트 추가 | `11_API_SPEC.md` |
| RAG/검색 로직 수정 | `14_RAG_DESIGN.md` |
| 프롬프트·답변 정책 | `15_PROMPT_STRATEGY.md` |
| 위젯 UI/동작 | `12_WIDGET_SPEC.md` |
| 보안·개인정보 | `16_SECURITY_PRIVACY_SPEC.md` |
| 배포·운영 | `18_DEPLOYMENT_OPERATIONS.md` |

## 전체 문서 목록

1. [01_PROJECT_OVERVIEW.md](./01_PROJECT_OVERVIEW.md) - 프로젝트 개요: IEUMBOT의 목적, 문제 정의, 핵심 가치, 범위를 정리합니다.
2. [02_PRD.md](./02_PRD.md) - 제품 요구사항 문서: 대상 사용자, 사용 시나리오, 성공 기준, 출시 범위를 정의합니다.
3. [03_USER_FLOWS.md](./03_USER_FLOWS.md) - 사용자 흐름: 방문자, 관리자, 운영자가 거치는 주요 경로와 예외 흐름을 정리합니다.
4. [04_INFORMATION_ARCHITECTURE.md](./04_INFORMATION_ARCHITECTURE.md) - 정보 구조: 화면, 메뉴, 콘텐츠, 데이터 탐색 구조를 구현 기준으로 정리합니다.
5. [05_FUNCTIONAL_REQUIREMENTS.md](./05_FUNCTIONAL_REQUIREMENTS.md) - 기능 요구사항: 위젯, 대화, 관리자 기능, 지식 관리 등 필수 기능을 명세합니다.
6. [06_NON_FUNCTIONAL_REQUIREMENTS.md](./06_NON_FUNCTIONAL_REQUIREMENTS.md) - 비기능 요구사항: 성능, 확장성, 접근성, 안정성, 사용성 기준을 정의합니다.
7. [07_SYSTEM_ARCHITECTURE.md](./07_SYSTEM_ARCHITECTURE.md) - 시스템 아키텍처: 주요 구성요소, 책임 분리, 통신 흐름, 배포 단위를 설명합니다.
8. [08_TECH_STACK.md](./08_TECH_STACK.md) - 기술 스택: 프런트엔드, 백엔드, 데이터베이스, 인프라, 외부 서비스 선택 기준을 기록합니다.
9. [09_REPOSITORY_STRUCTURE.md](./09_REPOSITORY_STRUCTURE.md) - 저장소 구조: 디렉터리, 모듈, 설정 파일, 문서 배치 원칙을 정의합니다.
10. [10_DATABASE_SCHEMA.md](./10_DATABASE_SCHEMA.md) - 데이터베이스 스키마: 주요 엔터티, 관계, 인덱스, 마이그레이션 기준을 정리합니다.
11. [11_API_SPEC.md](./11_API_SPEC.md) - API 명세: 엔드포인트, 요청과 응답, 인증, 오류 형식, 버전 관리 원칙을 정의합니다.
12. [12_WIDGET_SPEC.md](./12_WIDGET_SPEC.md) - 위젯 명세: 임베드 방식, UI 상태, 이벤트, 설정 옵션, 호스트 페이지 연동 기준을 정리합니다.
13. [13_ADMIN_CONSOLE_SPEC.md](./13_ADMIN_CONSOLE_SPEC.md) - 관리자 콘솔 명세: 운영 화면, 권한, 지식 관리, 대화 조회, 설정 기능을 정의합니다.
14. [14_RAG_DESIGN.md](./14_RAG_DESIGN.md) - RAG 설계: 문서 수집, 청킹, 임베딩, 검색, 재랭킹, 응답 생성 흐름을 설명합니다.
15. [15_PROMPT_STRATEGY.md](./15_PROMPT_STRATEGY.md) - 프롬프트 전략: 시스템 지침, 도메인 정책, 응답 형식, 실패 대응 전략을 정리합니다.
16. [16_SECURITY_PRIVACY_SPEC.md](./16_SECURITY_PRIVACY_SPEC.md) - 보안 및 개인정보 명세: 인증, 권한, 데이터 보호, 개인정보 처리, 감사 기준을 정의합니다.
17. [17_LOGGING_MONITORING_SPEC.md](./17_LOGGING_MONITORING_SPEC.md) - 로깅 및 모니터링 명세: 로그 항목, 지표, 알림, 추적, 장애 분석 기준을 정리합니다.
18. [18_DEPLOYMENT_OPERATIONS.md](./18_DEPLOYMENT_OPERATIONS.md) - 배포 및 운영: 환경 구성, 배포 절차, 롤백, 백업, 운영 점검 항목을 정의합니다.
19. [19_TEST_PLAN.md](./19_TEST_PLAN.md) - 테스트 계획: 단위, 통합, E2E, 보안, 성능 테스트 범위와 품질 게이트를 정리합니다.
20. [20_ROADMAP_MVP.md](./20_ROADMAP_MVP.md) - MVP 로드맵: 단계별 구현 순서, 우선순위, 마일스톤, 출시 후 개선 계획을 정리합니다.

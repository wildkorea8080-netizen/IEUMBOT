// knowledge.ts
// FAQ 생성·등록 관련 API 함수 및 타입 re-export
export { bulkRegisterFaq, generateFaqFromKnowledge } from "./admin-operations";
export type { FaqBulkRegisterResponse, FaqGenerateResponse, FaqItem } from "./admin-operations-types";

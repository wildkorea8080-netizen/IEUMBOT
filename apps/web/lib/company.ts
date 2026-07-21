/**
 * 사업자 정보 단일 출처.
 *
 * 랜딩 푸터 · 이용약관 · 개인정보처리방침이 모두 여기를 참조한다.
 * 값을 채우면 화면의 노란 자리표시가 자동으로 사라진다.
 *
 * null인 항목은 아직 확인되지 않은 값이다. 특히 사업자등록번호와 대표자명은
 * 법적 식별자이므로 추측해서 채우지 말 것.
 */
export const COMPANY = {
  /** 상호 */
  name: "딥시큐(DeepSecu)",
  /** 대표자 성명 — TODO: 확인 후 입력 */
  representative: null as string | null,
  /** 사업자등록번호 (000-00-00000) — TODO: 확인 후 입력 */
  businessNumber: null as string | null,
  /** 사업장 주소 */
  address: "서울특별시 송파구 마천로8길 1(오금동) 3층 112호",
  /** 대표 문의 이메일 */
  email: "haruty@deepsecu.co.kr",
  /** 대표 전화 */
  tel: "0507-1353-0046",

  /** 개인정보 보호책임자 — 법령상 지정·공개 의무 항목 */
  privacyOfficer: {
    name: null as string | null,
    title: null as string | null,
    email: "haruty@deepsecu.co.kr",
    tel: "0507-1353-0046",
  },

  /** 개인정보 보유 기간 — 계약·운영 정책 확정 후 입력 */
  retention: {
    chatLogs: null as string | null,
    inquiries: null as string | null,
  },

  /** 개인정보 처리 수탁자 중 확정 필요 항목 */
  processors: {
    cloud: null as string | null,
    cloudRegion: null as string | null,
    mail: null as string | null,
    mailRegion: null as string | null,
  },
} as const;

/** 약관·방침 시행일 */
export const LEGAL_EFFECTIVE_DATE = "2026년 7월 1일";

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

  /**
   * 개인정보 보유 기간.
   * 사실이 아니라 회사가 정하는 정책이므로 일반적인 기준으로 우선 명시한다.
   * 문의 기록 3년은 전자상거래법상 소비자 불만·분쟁 처리 기록 보존기간과 맞췄다.
   * 이용기관과의 계약에서 다르게 정하면 그 계약이 우선한다.
   */
  retention: {
    chatLogs: "1년",
    inquiries: "3년",
  },

  /**
   * 개인정보 처리 수탁자.
   * cloud는 서버 IP(115.68.218.28)가 스마일서브 대역인 것을 근거로 기재했다.
   * 실제 계약 주체와 다르면 수정할 것.
   * mail은 SMTP 미설정 상태 — 설정하는 시점에 사업자명을 채워야 한다.
   */
  processors: {
    cloud: "스마일서브(Smileserv)",
    cloudRegion: "대한민국",
    mail: null as string | null,
    mailRegion: null as string | null,
  },
} as const;

/** 약관·방침 시행일 */
export const LEGAL_EFFECTIVE_DATE = "2026년 7월 1일";

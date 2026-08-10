/*
 * 탐색 메뉴 일괄 등록 스크립트 (관리자 콘솔 브라우저 콘솔에서 실행)
 *
 * 관리 화면은 노드를 한 건씩 만들게 돼 있어, 기관 하나당 25~30번을 손으로 눌러야 한다.
 * 신규 기관 온보딩마다 반복되는 일이라 스크립트로 묶는다.
 *
 * 사용법
 *   1. https://chat.deepsecu.co.kr 에 해당 기관 관리자로 로그인
 *   2. F12 → Console 에 이 파일 전체를 붙여넣고 실행
 *   3. seedGuidedMenu("수도권매립지관리공사") 처럼 챗봇 이름(일부만 써도 됨) 호출
 *
 * 로그인 세션 쿠키를 그대로 쓰므로 별도 인증 정보가 필요 없다.
 * 이미 등록된 메뉴가 있으면 중단한다 — 덮어쓰려면 { force: true } 를 넘긴다.
 */

const API_BASE = "https://api.deepsecu.co.kr";

/**
 * 각 기관 홈페이지의 GNB를 그대로 옮기지 않고, 방문자가 실제로 물어볼 만한 것만 추렸다.
 * 사이트맵 전체(대분류 5 × 소분류 40+)를 복제하면 메뉴가 검색 대체재가 되어 오히려 못 찾는다.
 *
 * category = 하위를 담는 그릇(payload 없음), question = 누르면 챗봇에 전송되는 질문.
 * label 은 카드에 보이는 짧은 말, payload 는 실제로 전송되는 완성된 문장이다.
 *
 * payload 는 /api/chat/messages/precheck 로 실측해 웹 임계값(0.28)을 넘는 문구만 남겼다.
 * 짧고 일반적인 문장("찾아오시는 길을 알려주세요")은 내비게이션·푸터 청크에 걸려 점수가
 * 임계값 아래로 떨어진다 — 기관명이나 고유 명사를 넣으면 올라간다.
 * 메뉴를 새로 만들 때도 등록 전에 precheck 로 한 번 재보는 편이 안전하다.
 */
const MENUS = {
  수도권매립지관리공사: [
    {
      label: "폐기물 반입·처리",
      description: "반입 절차, 수수료, 매립지 운영",
      children: [
        { label: "반입 절차", payload: "폐기물 반입 절차가 어떻게 되나요?" },
        { label: "반입 수수료", payload: "폐기물 반입 수수료는 얼마인가요?" },
        { label: "반입 가능 품목", payload: "반입할 수 있는 폐기물 종류를 알려주세요." },
        { label: "매립지 운영 현황", payload: "매립지 운영 현황이 궁금합니다." },
        { label: "침출수 처리", payload: "침출수는 어떻게 처리하나요?" },
      ],
    },
    {
      label: "드림파크 이용·예약",
      description: "견학, 체육시설, 야생화단지",
      children: [
        { label: "견학 예약", payload: "드림파크 견학 신청 방법을 알려주세요." },
        { label: "체육시설 예약", payload: "체육시설 예약 방법을 알려주세요." },
        { label: "야생화단지", payload: "드림파크 야생화단지 관람 안내를 알려주세요." },
        { label: "골프장 이용", payload: "드림파크 골프장 이용 안내를 알려주세요." },
        { label: "스포츠센터", payload: "드림파크 스포츠센터 이용 요금이 궁금합니다." },
      ],
    },
    {
      label: "민원·신청",
      description: "전자민원, 정보공개, 기술지원",
      children: [
        { label: "전자민원 신청", payload: "전자민원은 어떻게 신청하나요?" },
        { label: "정보공개 청구", payload: "정보공개 청구 방법을 알려주세요." },
        { label: "기술지원 신청", payload: "기술지원 신청 절차가 궁금합니다." },
        { label: "매립시설 검사", payload: "매립시설 검사 지원은 어떻게 신청하나요?" },
        { label: "신고센터", payload: "부패 행위나 갑질 피해를 신고하려면 어떻게 하나요?" },
      ],
    },
    {
      label: "기관 안내",
      description: "하는 일, 조직, 오시는 길, 채용",
      children: [
        { label: "하는 일", payload: "수도권매립지관리공사는 어떤 일을 하나요?" },
        { label: "조직·담당업무", payload: "조직도와 담당 업무를 알려주세요." },
        { label: "찾아오시는 길", payload: "수도권매립지관리공사 위치와 주소를 알려주세요." },
        { label: "채용 공고", payload: "입사 지원과 채용 절차가 궁금합니다." },
        { label: "입찰·계약", payload: "입찰·계약 정보는 어디서 볼 수 있나요?" },
      ],
    },
    {
      label: "경영·환경 정보",
      description: "경영공시, 윤리경영, 환경경영",
      children: [
        { label: "경영공시", payload: "경영공시 자료는 어디서 볼 수 있나요?" },
        { label: "윤리·청렴", payload: "윤리경영과 청렴 활동이 궁금합니다." },
        { label: "환경경영", payload: "환경경영 방침과 ISO 14001 인증 현황을 알려주세요." },
        { label: "동반성장", payload: "중소기업 동반성장 지원 제도를 알려주세요." },
        { label: "대기환경 정보", payload: "대기환경 정보는 어디서 확인하나요?" },
      ],
    },
  ],

  한국수자원조사기술원: [
    {
      label: "수문조사기기 검정",
      description: "검정 대상, 신청, 증명서 발급",
      children: [
        { label: "검정 절차", payload: "수문조사기기 검정은 어떤 절차로 진행되나요?" },
        { label: "검정 대상 기기", payload: "검정 대상 기기에는 무엇이 있나요?" },
        { label: "검정 신청 방법", payload: "기기검정은 어떻게 신청하나요?" },
        { label: "검정증명서 발급", payload: "수문조사기기 검정증명서 발급 절차를 알려주세요." },
        { label: "수수료·소요 기간", payload: "검정 수수료와 소요 기간이 궁금합니다." },
      ],
    },
    {
      label: "수문조사 교육",
      description: "종사자 교육 과정과 신청",
      children: [
        { label: "교육 과정 안내", payload: "수문조사 종사자 교육은 어떤 과정인가요?" },
        { label: "교육 신청 방법", payload: "수문조사 종사자 교육 신청 방법을 알려주세요." },
        { label: "교육 일정", payload: "교육 일정은 어디서 확인하나요?" },
        { label: "수료 기준", payload: "교육 수료 기준이 궁금합니다." },
      ],
    },
    {
      label: "주요 업무",
      description: "수문조사, 유역조사, 연구사업",
      children: [
        { label: "수문조사란", payload: "수문조사란 무엇인가요?" },
        { label: "하천유역조사", payload: "전국 하천유역조사는 어떤 사업인가요?" },
        { label: "홍수피해 상황조사", payload: "홍수피해 상황조사는 무엇을 하는 일인가요?" },
        { label: "수문조사 컨설팅", payload: "수문조사 컨설팅을 받으려면 어떻게 해야 하나요?" },
        { label: "연구사업", payload: "어떤 연구사업을 하고 있나요?" },
      ],
    },
    {
      label: "기관 안내",
      description: "기관 소개, 조직, 오시는 길",
      children: [
        { label: "어떤 기관인가요", payload: "한국수자원조사기술원은 어떤 기관인가요?" },
        { label: "비전·경영전략", payload: "기관의 비전과 경영 전략을 알려주세요." },
        { label: "조직·담당자", payload: "조직도와 업무 담당자를 알려주세요." },
        { label: "찾아오시는 길", payload: "한국수자원조사기술원 위치와 주소를 알려주세요." },
      ],
    },
    {
      label: "알림·민원",
      description: "공지, 채용, 입찰, 정보공개",
      children: [
        { label: "공지사항", payload: "최근 공지사항과 알림 소식을 알려주세요." },
        { label: "채용 공고", payload: "채용 공고를 알려주세요." },
        { label: "입찰 공고", payload: "입찰 공고는 어디서 볼 수 있나요?" },
        { label: "정보공개 청구", payload: "정보공개 청구는 어떻게 하나요?" },
        { label: "클린신고센터", payload: "클린신고센터는 어떤 곳이고 어떻게 신고하나요?" },
      ],
    },
  ],
};

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function resolveChatbot(nameFragment) {
  const { items } = await api("/api/admin/chatbots");
  const matches = items.filter((c) => c.name.includes(nameFragment));
  if (matches.length === 0) {
    throw new Error(`'${nameFragment}' 과 일치하는 챗봇이 없습니다. 목록: ${items.map((c) => c.name).join(", ")}`);
  }
  if (matches.length > 1) {
    throw new Error(`'${nameFragment}' 이 여러 챗봇과 일치합니다: ${matches.map((c) => c.name).join(", ")}`);
  }
  return matches[0];
}

function resolveMenu(chatbotName) {
  const key = Object.keys(MENUS).find((k) => chatbotName.includes(k) || k.includes(chatbotName));
  if (!key) {
    throw new Error(`'${chatbotName}' 용 메뉴 정의가 없습니다. 정의된 기관: ${Object.keys(MENUS).join(", ")}`);
  }
  return MENUS[key];
}

async function seedGuidedMenu(chatbotNameFragment, { force = false } = {}) {
  const chatbot = await resolveChatbot(chatbotNameFragment);
  const menu = resolveMenu(chatbot.name);

  const existing = await api(`/api/admin/quick-actions?chatbotId=${chatbot.id}`);
  if (existing.length > 0 && !force) {
    console.warn(
      `[중단] '${chatbot.name}' 에 이미 ${existing.length}개 메뉴가 있습니다.\n` +
        `기존 것 위에 덧붙이려면 seedGuidedMenu("${chatbotNameFragment}", { force: true })`
    );
    return;
  }

  let created = 0;
  for (const [ci, category] of menu.entries()) {
    const parent = await api("/api/admin/quick-actions", {
      method: "POST",
      body: JSON.stringify({
        chatbotId: chatbot.id,
        label: category.label,
        description: category.description,
        actionType: "category",
        sortOrder: ci + 1,
      }),
    });
    created += 1;

    // 자식은 부모 id가 필요해 순차 생성한다. 병렬로 던지면 sortOrder가 뒤섞인다.
    for (const [qi, child] of category.children.entries()) {
      await api("/api/admin/quick-actions", {
        method: "POST",
        body: JSON.stringify({
          chatbotId: chatbot.id,
          parentId: parent.id,
          label: child.label,
          payload: child.payload,
          actionType: "question",
          sortOrder: qi + 1,
        }),
      });
      created += 1;
    }
    console.log(`  ✓ ${category.label} (질문 ${category.children.length}개)`);
  }

  console.log(`[완료] '${chatbot.name}' 탐색 메뉴 ${created}개 등록`);
}

console.log(
  "탐색 메뉴 시드 준비 완료. 다음 중 하나를 실행하세요:\n" +
    Object.keys(MENUS)
      .map((name) => `  await seedGuidedMenu("${name}")`)
      .join("\n")
);

/**
 * 로고월 자리.
 *
 * 지금은 "우리가 어떤 기관을 위해 만들었는가"(사실)를 보여준다.
 * 실제 도입 기관 로고로 교체할 때는 아래 INSTITUTION_TYPES를 REFERENCES 형태로
 * 바꾸고 섹션 제목·안내 문구만 수정하면 된다. 레이아웃은 그대로 재사용된다.
 *
 *   const REFERENCES = [{ name: "○○구시설관리공단", logo: "/logos/xxx.svg" }, ...];
 *
 * 주의: 기관 동의 없이 실제 기관명을 도입 사례로 노출하지 말 것.
 * 공공기관 구매 판단에 쓰이는 화면이라 허위 실적이 된다.
 */

const INSTITUTION_TYPES = [
  "시·군·구청",
  "시설관리공단",
  "교육청·학교",
  "공공도서관",
  "문화재단",
  "보건소",
  "상수도사업본부",
  "체육진흥공단",
  "복지관",
  "농업기술센터",
  "공공병원",
  "출연연구기관",
];

export function InstitutionMarquee() {
  return (
    <section className="border-b border-slate-200 bg-white py-14">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
            지자체부터 공단·교육청까지
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-slate-600">
            공공기관 민원실에 실제로 걸려 오는 문의를 기준으로 설계했습니다.
          </p>
        </div>
      </div>

      {/* 양옆 페이드 — 마퀴가 화면 끝에서 잘리는 느낌을 없앤다 */}
      <div className="landing-marquee-mask relative mt-9 overflow-hidden">
        <ul className="landing-marquee flex w-max gap-3 pr-3">
          {[...INSTITUTION_TYPES, ...INSTITUTION_TYPES].map((name, index) => (
            <li
              key={`${name}-${index}`}
              aria-hidden={index >= INSTITUTION_TYPES.length}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-[15px] font-semibold text-slate-700"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>

      <p className="mx-auto mt-8 max-w-2xl px-5 text-center text-[13px] leading-6 text-slate-500">
        실제 도입 기관명과 로고는 해당 기관의 동의 절차가 끝난 뒤에만 공개합니다.
        <br className="hidden sm:block" /> 도입 검토 중이시라면 문의 시 유사 기관 사례를 개별로
        안내해 드립니다.
      </p>
    </section>
  );
}

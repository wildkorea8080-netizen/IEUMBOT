import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Field, LegalLayout, List, Section } from "../../components/legal/legal-layout";
import { COMPANY, LEGAL_EFFECTIVE_DATE } from "../../lib/company";

export const metadata: Metadata = {
  title: "개인정보처리방침 | IEUMBOT",
  description: "IEUMBOT 개인정보처리방침",
};

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            {head.map((cell) => (
              <th
                key={cell}
                className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-700"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border border-slate-200 px-3 py-2 align-top text-slate-600"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <LegalLayout title="개인정보처리방침" effectiveDate={LEGAL_EFFECTIVE_DATE}>
      <Section heading="1. 총칙">
        <p>
          {COMPANY.name}(이하 &ldquo;회사&rdquo;)은 문서 기반 AI 챗봇 서비스
          IEUMBOT(이하 &ldquo;서비스&rdquo;)을 제공하면서 「개인정보 보호법」 등 관련 법령을 준수하며,
          이용자의 개인정보를 보호하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
        </p>
        <p>
          회사는 이용기관이 자신의 목적을 위해 서비스를 이용하는 과정에서 처리되는 최종이용자의
          개인정보에 대하여 <strong className="font-semibold text-slate-800">수탁자(처리자)</strong>의
          지위에 있으며, 해당 개인정보의 수집 목적과 범위는 이용기관이 정합니다.
        </p>
      </Section>

      <Section heading="2. 수집하는 개인정보 항목 및 수집 방법">
        <Table
          head={["구분", "수집 항목", "수집 방법"]}
          rows={[
            ["관리자 계정", "이메일 주소, 비밀번호(암호화 저장), 소속 기관명, 접속 IP·일시", "회원가입·로그인"],
            ["도입 문의", "담당자명, 기관명, 연락처, 이메일, 문의 내용", "도입 문의 폼 입력"],
            [
              "챗봇 이용 기록",
              "질문·답변 내용, 대화 세션 식별자, 접속 IP, 브라우저 정보, 이용 일시",
              "챗봇 위젯 이용 시 자동 생성",
            ],
            ["결제 정보(유료 이용 시)", "결제 수단 정보, 거래 내역", "결제 시 입력(결제대행사 처리)"],
          ]}
        />
        <p className="text-sm text-slate-500">
          회사는 챗봇 대화에서 주민등록번호 등 고유식별정보나 민감정보를 수집하지 않으며, 입력이
          감지된 경우 마스킹 처리하거나 답변을 제한합니다. 최종이용자는 대화창에 개인정보를 입력하지
          않아야 합니다.
        </p>
      </Section>

      <Section heading="3. 개인정보의 처리 목적">
        <List
          items={[
            <>회원 식별, 계정 관리, 권한 부여 및 서비스 제공</>,
            <>질문에 대한 근거 기반 답변 생성 및 대화 이력 제공</>,
            <>서비스 품질 개선, 오류·장애 대응, 부정 이용 방지</>,
            <>이용 문의 응대 및 계약·요금 정산</>,
            <>법령상 의무 이행</>,
          ]}
        />
      </Section>

      <Section heading="4. 개인정보의 보유 및 이용 기간">
        <Table
          head={["구분", "보유 기간", "근거"]}
          rows={[
            ["관리자 계정 정보", "이용계약 종료 또는 회원 탈퇴 시까지", "이용자 동의"],
            [
              "챗봇 대화 기록",
              <>
                수집일로부터 <Field value={COMPANY.retention.chatLogs} label="보유기간" />
              </>,
              "이용기관과의 계약",
            ],
            [
              "도입 문의 기록",
              <>
                문의 처리 완료 후 <Field value={COMPANY.retention.inquiries} label="보유기간" />
              </>,
              "이용자 동의",
            ],
            ["접속 기록", "3개월", "통신비밀보호법"],
            ["계약·결제 기록", "5년", "전자상거래법"],
            ["소비자 불만·분쟁 처리 기록", "3년", "전자상거래법"],
          ]}
        />
        <p className="text-sm text-slate-500">
          보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은
          복구할 수 없는 방법으로 삭제하고, 출력물은 분쇄 또는 소각합니다.
        </p>
      </Section>

      <Section heading="5. 개인정보 처리의 위탁">
        <p>회사는 서비스 제공을 위하여 아래와 같이 개인정보 처리 업무를 위탁하고 있습니다.</p>
        <Table
          head={["수탁자", "위탁 업무", "비고"]}
          rows={[
            ["OpenAI, L.P.", "질문·문서의 임베딩 생성 및 답변 생성", "미국 / API 호출 시점에 처리"],
            ["Anthropic, PBC", "답변 생성(설정에 따라 선택적 사용)", "미국 / API 호출 시점에 처리"],
            [
              <Field key="cloud" value={COMPANY.processors.cloud} label="클라우드 인프라 사업자" />,
              "서버·데이터베이스 운영 및 보관",
              <Field key="cloudr" value={COMPANY.processors.cloudRegion} label="소재 국가" />,
            ],
            // 메일 발송은 SMTP를 설정한 뒤에만 실제로 위탁이 발생한다.
            ...(COMPANY.processors.mail
              ? [
                  [
                    COMPANY.processors.mail,
                    "인증·안내 메일 발송",
                    <Field
                      key="mailr"
                      value={COMPANY.processors.mailRegion}
                      label="소재 국가"
                    />,
                  ],
                ]
              : []),
          ]}
        />
      </Section>

      <Section heading="6. 개인정보의 국외 이전">
        <p>
          답변 생성 및 임베딩 처리를 위해 질문 내용과 검색된 문서 일부가 위 5항의 인공지능 API
          사업자에게 전송되어 미국 내 서버에서 처리됩니다. 이전 항목은 이용자가 입력한 질문과 근거
          문서 텍스트이며, 이전 시점은 API 호출 시, 이전 방법은 암호화된 통신(HTTPS)입니다. 해당
          사업자는 회사와의 계약에 따라 전송된 데이터를 모델 학습에 사용하지 않습니다.
        </p>
        <p>
          그 외 서버와 데이터베이스는 {COMPANY.processors.cloudRegion} 내에 위치하며, 등록 자료와
          대화 기록의 원본은 국내에 보관됩니다.
        </p>
        <p className="text-sm text-slate-500">
          국외 이전을 원하지 않는 이용기관은 별도 협의를 통해 처리 구성 조정 여부를 문의하실 수
          있습니다.
        </p>
      </Section>

      <Section heading="7. 개인정보의 제3자 제공">
        <p>
          회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 특별한 규정이 있거나
          수사기관이 적법한 절차에 따라 요구하는 경우에는 예외로 합니다.
        </p>
      </Section>

      <Section heading="8. 정보주체의 권리와 행사 방법">
        <List
          items={[
            <>
              이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.
            </>,
            <>
              권리 행사는 서비스 내 설정 화면 또는 아래 개인정보 보호책임자에게 서면·이메일로 요청할 수
              있으며, 회사는 지체 없이 조치합니다.
            </>,
            <>
              챗봇을 통해 수집된 최종이용자의 개인정보에 대한 권리 행사는 해당 서비스를 운영하는
              이용기관에 요청하시면 됩니다. 회사는 이용기관의 지시에 따라 처리합니다.
            </>,
          ]}
        />
      </Section>

      <Section heading="9. 개인정보의 안전성 확보 조치">
        <List
          items={[
            <>비밀번호 단방향 암호화 저장 및 전송 구간 암호화(HTTPS)</>,
            <>접근 권한의 최소화 및 기관 단위 데이터 분리</>,
            <>관리자 접속 기록 보관 및 위·변조 방지</>,
            <>대화 입력에 포함된 개인정보 패턴 자동 탐지·마스킹</>,
            <>백업 데이터 암호화 보관 및 정기 점검</>,
          ]}
        />
      </Section>

      <Section heading="10. 쿠키 등 자동 수집 장치">
        <p>
          회사는 로그인 세션 유지를 위해 필요한 최소한의 쿠키·브라우저 저장소를 사용합니다. 광고·행태
          정보 수집 목적의 쿠키는 사용하지 않습니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할
          수 있으나, 이 경우 로그인 등 일부 기능을 이용할 수 없습니다.
        </p>
      </Section>

      <Section heading="11. 개인정보 보호책임자">
        {/* 개인정보보호법 제30조는 "성명 또는 직책"을 요구한다.
            성명이 확정되기 전에는 직책과 연락처만 표시한다. */}
        <p className="text-sm leading-7">
          {COMPANY.privacyOfficer.name ? (
            <>
              성명: {COMPANY.privacyOfficer.name}
              <br />
            </>
          ) : null}
          직책: {COMPANY.privacyOfficer.title}
          <br />
          이메일: {COMPANY.privacyOfficer.email}
          <br />
          전화: {COMPANY.privacyOfficer.tel}
        </p>
        <p className="text-sm text-slate-500">
          개인정보 침해에 관한 상담이 필요한 경우 개인정보침해신고센터(privacy.kisa.or.kr,
          국번없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972), 대검찰청 사이버수사과(1301),
          경찰청 사이버수사국(182)에 문의하실 수 있습니다.
        </p>
      </Section>

      <Section heading="12. 개인정보처리방침의 변경">
        <p>
          본 방침의 내용 추가·삭제 및 수정이 있을 경우 시행 7일 전부터 서비스 공지사항을 통해
          고지합니다. 다만 이용자 권리의 중대한 변경이 발생하는 경우에는 최소 30일 전에 고지합니다.
        </p>
        <p>
          공고일자: {LEGAL_EFFECTIVE_DATE} / 시행일자: {LEGAL_EFFECTIVE_DATE}
        </p>
      </Section>
    </LegalLayout>
  );
}

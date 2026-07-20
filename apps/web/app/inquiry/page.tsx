"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";

import { ApiClientError } from "../../lib/api";
import { submitInquiry } from "../../lib/api/inquiries-operations";

const INTEREST_OPTIONS = [
  { value: "", label: "관심 플랜 (선택)" },
  { value: "스탠다드", label: "스탠다드" },
  { value: "프로", label: "프로" },
  { value: "엔터프라이즈", label: "엔터프라이즈" },
  { value: "미정", label: "아직 미정 / 상담 후 결정" },
];

export default function InquiryPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await submitInquiry({
        organizationName,
        contactName,
        email,
        phone,
        interest: interest || null,
        message: message || null,
        source: "web_inquiry",
      });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 429) {
        setErrorMessage("문의가 너무 많이 접수되었습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        setErrorMessage("문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        {done ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
              ✓
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">문의가 접수되었습니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              담당자가 확인 후 남겨주신 연락처로 <span className="font-semibold text-slate-800">영업일 기준 1~2일 내</span>{" "}
              연락드리겠습니다. 계정은 상담 후 발급됩니다.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">IEUMBOT 도입 문의</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              공공기관 전용 문서기반 AI 챗봇. 담당자 정보를 남겨주시면 확인 후 연락드리고, 상담을 통해 계정을 발급해
              드립니다.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">기관·회사명 *</span>
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="○○시청 / ○○공단"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
                  required
                  maxLength={200}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">담당자명 *</span>
                  <input
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="홍길동"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
                    required
                    maxLength={120}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">연락처 *</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
                    required
                    maxLength={50}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">이메일 *</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@organization.go.kr"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
                  required
                  maxLength={255}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">관심 플랜</span>
                <select
                  value={interest}
                  onChange={(event) => setInterest(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
                >
                  {INTEREST_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">문의 내용</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="도입 목적, 예상 사용 규모, 궁금한 점 등을 자유롭게 남겨주세요."
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
                  maxLength={4000}
                />
              </label>

              {errorMessage ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-md bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "접수 중..." : "도입 문의 보내기"}
              </button>

              <p className="text-center text-xs text-slate-400">
                이미 계정이 있으신가요?{" "}
                <Link href="/login" className="font-medium text-brand-600 hover:underline">
                  로그인
                </Link>
              </p>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

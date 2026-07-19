"use client";

import { useEffect, useState } from "react";

import { getOAuthStartUrl } from "../../lib/api/base-url";
import { getOAuthProviders } from "../../lib/api/oauth-operations";

type ProviderMeta = {
  label: string;
  className: string;
  mark: string;
};

const PROVIDER_META: Record<string, ProviderMeta> = {
  google: {
    label: "구글 계정으로 시작하기",
    className: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    mark: "G",
  },
  kakao: {
    label: "카카오 계정으로 시작하기",
    className: "bg-[#FEE500] text-[#191600] hover:brightness-95",
    mark: "K",
  },
  naver: {
    label: "네이버 계정으로 시작하기",
    className: "bg-[#03C75A] text-white hover:brightness-95",
    mark: "N",
  },
};

const PROVIDER_ORDER = ["google", "kakao", "naver"];

export function SnsLoginButtons() {
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    void getOAuthProviders().then((list) => {
      if (mounted) {
        setProviders(list);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 로딩 중이거나 설정된 제공사가 없으면 아무것도 렌더하지 않음(기존 로그인 화면 그대로).
  if (!providers || providers.length === 0) {
    return null;
  }

  const ordered = PROVIDER_ORDER.filter((provider) => providers.includes(provider));

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        SNS 간편 로그인 · 회원가입
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="mt-4 space-y-2">
        {ordered.map((provider) => {
          const meta = PROVIDER_META[provider];
          return (
            <a
              key={provider}
              href={getOAuthStartUrl(provider)}
              className={`flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition ${meta.className}`}
            >
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[11px] font-bold"
              >
                {meta.mark}
              </span>
              {meta.label}
            </a>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        가입 시 <span className="font-semibold text-slate-500">7일 무료체험</span>이 시작됩니다.
      </p>
    </div>
  );
}

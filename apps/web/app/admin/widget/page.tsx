"use client";

import { useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminWidget, patchAdminWidget } from "../../../lib/api/admin-operations";
import type { AdminWidgetResponse } from "../../../lib/api/admin-operations-types";

const COLOR_PRESETS = [
  { value: "default", label: "기본 공공기관", preview: "from-blue-600 to-green-500" },
  { value: "civic", label: "시정 민원형", preview: "from-blue-800 to-emerald-700" },
  { value: "sky", label: "서울 하늘형", preview: "from-blue-700 to-sky-500" },
  { value: "forest", label: "산림 정책형", preview: "from-green-800 to-teal-600" },
  { value: "sunset", label: "상담 안내형", preview: "from-amber-700 to-orange-500" },
] as const;

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M7 10h10" />
      <path d="M7 14h6" />
      <path d="M21 12a8.96 8.96 0 0 1-2.64 6.36A9 9 0 1 1 21 12Z" />
      <path d="m15 19 3.5 3.5" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

function gradientClass(preset: string) {
  return COLOR_PRESETS.find((item) => item.value === preset)?.preview ?? "from-blue-600 to-green-500";
}

export default function WidgetPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [domainsInput, setDomainsInput] = useState("");
  const [launcherLabel, setLauncherLabel] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [introMessage, setIntroMessage] = useState("");
  const [themeColor, setThemeColor] = useState("#2563EB");
  const [colorPreset, setColorPreset] = useState("default");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerDescription, setBannerDescription] = useState("");
  const [starterQuestionsInput, setStarterQuestionsInput] = useState("");
  const [data, setData] = useState<AdminWidgetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const starterQuestions = useMemo(
    () =>
      starterQuestionsInput
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    [starterQuestionsInput],
  );

  const previewTitle = institutionName.trim() || "기관";
  const previewLauncher = launcherLabel.trim() || "챗봇 열기";
  const previewIntro =
    introMessage.trim() ||
    `안녕하세요\n${previewTitle} AI 챗봇입니다.\n\n궁금하신 내용을 입력해주시면\n빠르게 안내해드리겠습니다.`;
  const iframeSrcDoc = useMemo(() => {
    const chatbotKey = chatbotId.trim();
    if (!chatbotKey) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const payload = {
      chatbotId: chatbotKey,
      chatbotName: previewTitle,
      institutionName: previewTitle,
      logoUrl: logoUrl.trim() || null,
      introMessage: introMessage.trim() || null,
      welcomeMessage: welcomeMessage.trim() || previewIntro,
      privacyNotice: null,
      citationMode: "optional",
      theme: {
        primaryColor: themeColor.trim() || "#2563EB",
        textColor: null,
        backgroundColor: null,
        preset: colorPreset,
      },
      banner: {
        title: bannerTitle.trim() || null,
        description: bannerDescription.trim() || null,
      },
      starterQuestions,
      quickActions: [],
      operatingHours: {
        isAfterHours: false,
        message: null,
      },
      runtime: {
        chatEndpoint: "/chat/messages",
        chatStreamEndpoint: "/chat/messages/stream",
        streamingMode: "sse_preferred",
        sseEnabled: true,
      },
    };

    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IEUMBOT Widget Preview</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top, rgba(59,130,246,0.10), transparent 42%),
          linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
      }
      body {
        position: relative;
        font-family: Pretendard, "Noto Sans KR", sans-serif;
      }
    </style>
  </head>
  <body>
    <script>
      const __IEUMBOT_PREVIEW_CONFIG__ = ${serialized};
      const __originalFetch__ = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (url.includes("/widget/config/${chatbotKey}")) {
          return new Response(JSON.stringify(__IEUMBOT_PREVIEW_CONFIG__), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return __originalFetch__(input, init);
      };
    </script>
    <script src="/widget.js" data-chatbot-id="${chatbotKey}" data-api-base-url="${origin}/api" data-open-on-load="true"></script>
  </body>
</html>`;
  }, [
    bannerDescription,
    bannerTitle,
    chatbotId,
    colorPreset,
    introMessage,
    logoUrl,
    previewIntro,
    previewTitle,
    starterQuestions,
    themeColor,
    welcomeMessage,
  ]);

  const load = async () => {
    if (!chatbotId.trim()) {
      setError("챗봇 ID를 입력해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await getAdminWidget(chatbotId.trim());
      setData(res);
      setDomainsInput((res.allowedDomains ?? []).join(", "));
      setLauncherLabel(res.launcherLabel ?? "");
      setInstitutionName(res.institutionName ?? "");
      setLogoUrl(res.logoUrl ?? "");
      setIntroMessage(res.introMessage ?? "");
      setThemeColor(res.themeColor ?? "#2563EB");
      setColorPreset(res.colorPreset ?? "default");
      setWelcomeMessage(res.welcomeMessage ?? "");
      setBannerTitle(res.bannerTitle ?? "");
      setBannerDescription(res.bannerDescription ?? "");
      setStarterQuestionsInput((res.starterQuestions ?? []).join("\n"));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!chatbotId.trim()) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const allowedDomains = domainsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const res = await patchAdminWidget(chatbotId.trim(), {
        allowedDomains,
        launcherLabel: launcherLabel.trim(),
        institutionName: institutionName.trim(),
        logoUrl: logoUrl.trim(),
        introMessage: introMessage.trim(),
        themeColor: themeColor.trim(),
        colorPreset,
        welcomeMessage: welcomeMessage.trim(),
        bannerTitle: bannerTitle.trim(),
        bannerDescription: bannerDescription.trim(),
        starterQuestions,
      });
      setData(res);
      setSuccess("위젯 설정을 저장했습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (nextValue: boolean) => {
    if (!chatbotId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await patchAdminWidget(chatbotId.trim(), { isActive: nextValue });
      setData(res);
      setSuccess(nextValue ? "위젯을 활성화했습니다." : "위젯을 비활성화했습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel
        title="위젯 설정"
        description="공개 사이트에 삽입되는 챗봇 위젯의 브랜드, 배너, 시작 질문 카드와 실제 화면 미리보기를 함께 관리합니다."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={chatbotId}
            onChange={(event) => setChatbotId(event.target.value)}
            placeholder="챗봇 ID"
            className="w-full max-w-xl rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            조회
          </button>
        </div>

        {isLoading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        {data ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="font-medium text-slate-900">위젯 상태</p>
                  <p className="mt-1 text-slate-600">{data.status}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">기본 위치</p>
                  <p className="mt-1 text-slate-600">{data.position ?? "bottom-right"}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">허용 도메인</span>
                  <input
                    value={domainsInput}
                    onChange={(event) => setDomainsInput(event.target.value)}
                    placeholder="example.go.kr, portal.example.go.kr"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">플로팅 버튼 라벨</span>
                  <input
                    value={launcherLabel}
                    onChange={(event) => setLauncherLabel(event.target.value)}
                    placeholder="AI 상담 챗봇"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">기관명</span>
                  <input
                    value={institutionName}
                    onChange={(event) => setInstitutionName(event.target.value)}
                    placeholder="서울시 해외농업개발센터"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">로고 URL</span>
                  <input
                    value={logoUrl}
                    onChange={(event) => setLogoUrl(event.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">대표 색상</span>
                  <input
                    value={themeColor}
                    onChange={(event) => setThemeColor(event.target.value)}
                    placeholder="#2563EB"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">기관별 컬러 프리셋</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {COLOR_PRESETS.map((preset) => {
                    const active = colorPreset === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setColorPreset(preset.value)}
                        className={`rounded-2xl border p-3 text-left transition ${
                          active
                            ? "border-blue-400 bg-blue-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`h-10 rounded-xl bg-gradient-to-r ${preset.preview}`} />
                        <p className="mt-3 text-sm font-semibold text-slate-900">{preset.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">초기 안내 문구</span>
                  <textarea
                    value={introMessage}
                    onChange={(event) => setIntroMessage(event.target.value)}
                    rows={4}
                    placeholder="채팅창이 열릴 때 처음 보여줄 안내 문구"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">상단 안내 배너 제목</span>
                  <input
                    value={bannerTitle}
                    onChange={(event) => setBannerTitle(event.target.value)}
                    placeholder="해외농업 관련 문의를 도와드립니다"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">상단 안내 배너 설명</span>
                  <textarea
                    value={bannerDescription}
                    onChange={(event) => setBannerDescription(event.target.value)}
                    rows={3}
                    placeholder="운영시간, 상담 범위, 응답 안내 등을 입력하세요."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">대화 시작 추천 질문 카드</span>
                  <textarea
                    value={starterQuestionsInput}
                    onChange={(event) => setStarterQuestionsInput(event.target.value)}
                    rows={5}
                    placeholder={`주요 사업이 궁금해요\n지원 대상이 누구인가요?\n신청 절차를 알려주세요`}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-500">한 줄에 하나씩 입력하면 시작 질문 카드로 노출됩니다.</p>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">기본 환영 메시지</span>
                  <textarea
                    value={welcomeMessage}
                    onChange={(event) => setWelcomeMessage(event.target.value)}
                    rows={3}
                    placeholder="공개 위젯 config의 기본 welcome 메시지"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveSettings()}
                  className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSaving ? "저장 중..." : "설정 저장"}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(true)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                >
                  활성화
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(false)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                >
                  비활성화
                </button>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600">설치 스크립트</p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {data.installScript ?? "등록된 스크립트가 없습니다."}
                </pre>
              </div>
            </div>

            <div className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">실시간 미리보기</p>
                  <p className="mt-1 text-xs text-slate-500">현재 입력한 설정 기준으로 위젯 화면을 바로 확인할 수 있습니다.</p>
                </div>

                <div className="relative min-h-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.10),_transparent_42%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-5">
                  <div className="absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg transition hover:scale-105 hover:shadow-xl xl:flex from-blue-600 to-green-500">
                    <ChatIcon />
                  </div>

                  <div className="absolute right-5 top-5 flex w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
                    <div className={`flex min-h-[60px] items-center justify-between bg-gradient-to-br ${gradientClass(colorPreset)} px-4 py-3 text-white`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                          {logoUrl.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl.trim()} alt="기관 로고" className="h-5 w-5 rounded-full object-contain" />
                          ) : (
                            <ChatIcon />
                          )}
                        </div>
                        <div className="truncate text-sm font-semibold">{`AI 챗봇 ${previewTitle}`}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                          <MinimizeIcon />
                        </button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                          <CloseIcon />
                        </button>
                      </div>
                    </div>

                    {(bannerTitle.trim() || bannerDescription.trim()) && (
                      <div className="m-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-white to-blue-50 px-4 py-3">
                        {bannerTitle.trim() ? (
                          <p className="text-xs font-bold text-blue-900">{bannerTitle.trim()}</p>
                        ) : null}
                        {bannerDescription.trim() ? (
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{bannerDescription.trim()}</p>
                        ) : null}
                      </div>
                    )}

                    <div className="flex flex-1 flex-col gap-3 bg-slate-50 px-4 pb-4 pt-0">
                      <div className="rounded-2xl bg-white px-4 py-3 text-[13px] leading-6 text-slate-900 shadow-sm">
                        <div className="whitespace-pre-wrap">{previewIntro}</div>
                      </div>

                      {starterQuestions.length > 0 ? (
                        <div className="grid gap-2">
                          {starterQuestions.slice(0, 4).map((question) => (
                            <button
                              key={question}
                              type="button"
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-sm"
                            >
                              {question}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="self-end rounded-2xl bg-blue-600 px-4 py-3 text-[13px] text-white">
                        주요 사업이 궁금해요
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-[13px] leading-6 text-slate-900 shadow-sm">
                        해외농업개발 관련 주요 사업, 지원 대상, 신청 절차 등을 안내해드릴 수 있습니다.
                      </div>
                    </div>

                    <div className="flex min-h-16 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
                      <div className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-xs text-slate-400">
                        무엇을 도와드릴까요?
                      </div>
                      <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
                        <SendIcon />
                      </button>
                    </div>
                  </div>

                  <div className="absolute bottom-6 left-6 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm">
                    버튼 라벨: {previewLauncher}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">실제 widget.js iframe 미리보기</p>
                  <p className="mt-1 text-xs text-slate-500">
                    공개 위젯 스크립트를 iframe 안에서 그대로 실행합니다. 설정 API만 현재 입력값으로 덮어써 저장 전 상태도 확인할 수 있습니다.
                  </p>
                </div>

                {chatbotId.trim() ? (
                  <iframe
                    title="IEUMBOT widget iframe preview"
                    srcDoc={iframeSrcDoc}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    className="h-[640px] w-full rounded-2xl border border-slate-200 bg-white"
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    챗봇 ID를 입력하면 실제 widget.js iframe 미리보기를 확인할 수 있습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}

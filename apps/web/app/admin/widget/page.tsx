"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import {
  deleteAdminWidgetIcon,
  getAdminChatbots,
  getAdminWidget,
  listAdminWidgetIcons,
  patchAdminWidget,
  uploadAdminWidgetIcon,
} from "../../../lib/api/admin-operations";
import type { AdminChatbotItem, AdminWidgetIconAsset, AdminWidgetResponse } from "../../../lib/api/admin-operations-types";

const COLOR_PRESETS = [
  { value: "default", label: "기본 공공기관", preview: "from-blue-600 to-green-500" },
  { value: "civic", label: "시정 민원형", preview: "from-blue-800 to-emerald-700" },
  { value: "sky", label: "서울 하늘형", preview: "from-blue-700 to-sky-500" },
  { value: "forest", label: "산림 정책형", preview: "from-green-800 to-teal-600" },
  { value: "sunset", label: "상담 안내형", preview: "from-amber-700 to-orange-500" },
] as const;

const LAUNCHER_ICONS = [
  { value: "chat", label: "채팅" },
  { value: "heart", label: "하트" },
  { value: "shield", label: "보호" },
  { value: "leaf", label: "잎" },
  { value: "spark", label: "반짝임" },
] as const;

const LOVE_CHAT_ICON_SRC = "/widget-icons/love-chat-icons.png";
const DEFAULT_GENERATED_ICON_ASSETS: AdminWidgetIconAsset[] = [
  { id: "/widget-icons/generated/1.png", name: "위젯 아이콘 1", url: "/widget-icons/generated/1.png", deletable: false },
  { id: "/widget-icons/generated/2.png", name: "위젯 아이콘 2", url: "/widget-icons/generated/2.png", deletable: false },
  { id: "/widget-icons/generated/3.png", name: "위젯 아이콘 3", url: "/widget-icons/generated/3.png", deletable: false },
  { id: "/widget-icons/generated/4.png", name: "위젯 아이콘 4", url: "/widget-icons/generated/4.png", deletable: false },
  { id: "/widget-icons/generated/5.png", name: "위젯 아이콘 5", url: "/widget-icons/generated/5.png", deletable: false },
  { id: "/widget-icons/generated/6.png", name: "위젯 아이콘 6", url: "/widget-icons/generated/6.png", deletable: false },
  { id: "/widget-icons/generated/7.png", name: "위젯 아이콘 7", url: "/widget-icons/generated/7.png", deletable: false },
  { id: "/widget-icons/generated/8.png", name: "위젯 아이콘 8", url: "/widget-icons/generated/8.png", deletable: false },
  { id: "/widget-icons/generated/9.png", name: "위젯 아이콘 9", url: "/widget-icons/generated/9.png", deletable: false },
  { id: "/widget-icons/generated/10.png", name: "위젯 아이콘 10", url: "/widget-icons/generated/10.png", deletable: false },
  { id: "/widget-icons/generated/11.png", name: "위젯 아이콘 11", url: "/widget-icons/generated/11.png", deletable: false },
  { id: "/widget-icons/generated/12.png", name: "위젯 아이콘 12", url: "/widget-icons/generated/12.png", deletable: false },
];

function mergeVisibleLauncherIcons(items: AdminWidgetIconAsset[]): AdminWidgetIconAsset[] {
  const map = new Map<string, AdminWidgetIconAsset>();
  for (const item of DEFAULT_GENERATED_ICON_ASSETS) {
    map.set(item.url, item);
  }
  for (const item of items) {
    map.set(item.url, item);
  }
  return Array.from(map.values());
}

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

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M19.5 12.57 12 20l-7.5-7.43a4.95 4.95 0 0 1 0-7 4.95 4.95 0 0 1 7 0L12 6l.5-.43a4.95 4.95 0 0 1 7 7Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3 5 6v6c0 5 3.5 7.7 7 9 3.5-1.3 7-4 7-9V6l-7-3Z" />
      <path d="m9.5 12 1.7 1.7L14.8 10" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M11 20c5 0 9-4 9-9V4h-7c-5 0-9 4-9 9 0 4 3 7 7 7Z" />
      <path d="M8 16c2-3 5-5 9-6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
      <path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />
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

function getLauncherIconNode(icon: string, iconUrl?: string) {
  if (icon === "love-chat") {
    return <img src={LOVE_CHAT_ICON_SRC} alt="" className="h-full w-full rounded-full object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.18)]" />;
  }
  if (icon === "custom" && iconUrl?.trim()) {
    return <img src={iconUrl.trim()} alt="" className="h-full w-full rounded-full object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.18)]" />;
  }
  if (icon === "heart") return <HeartIcon />;
  if (icon === "shield") return <ShieldIcon />;
  if (icon === "leaf") return <LeafIcon />;
  if (icon === "spark") return <SparkIcon />;
  return <ChatIcon />;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

function gradientClass(preset: string) {
  return COLOR_PRESETS.find((item) => item.value === preset)?.preview ?? "from-blue-600 to-green-500";
}

export default function WidgetPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [domainsInput, setDomainsInput] = useState("");
  const [launcherLabel, setLauncherLabel] = useState("");
  const [launcherIcon, setLauncherIcon] = useState("chat");
  const [launcherIconUrl, setLauncherIconUrl] = useState("");
  const [launcherHoverMessage, setLauncherHoverMessage] = useState("");
  const [chatbotDisplayName, setChatbotDisplayName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [introMessage, setIntroMessage] = useState("");
  const [themeColor, setThemeColor] = useState("#2563EB");
  const [colorPreset, setColorPreset] = useState("default");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerDescription, setBannerDescription] = useState("");
  const [starterQuestionsInput, setStarterQuestionsInput] = useState("");
  const [launcherImageIcons, setLauncherImageIcons] = useState<AdminWidgetIconAsset[]>([]);
  const [launcherIconFile, setLauncherIconFile] = useState<File | null>(null);
  const [launcherIconInputKey, setLauncherIconInputKey] = useState(0);
  const [data, setData] = useState<AdminWidgetResponse | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [deletingIconUrl, setDeletingIconUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [debouncedIframeState, setDebouncedIframeState] = useState({
    selectedChatbotId: "",
    chatbotName: "",
    chatbotDisplayName: "",
    institutionName: "",
    logoUrl: "",
    introMessage: "",
    themeColor: "#2563EB",
    colorPreset: "default",
    welcomeMessage: "",
    bannerTitle: "",
    bannerDescription: "",
    launcherIcon: "chat",
    launcherIconUrl: "",
    launcherHoverMessage: "",
    starterQuestions: [] as string[],
  });

  const starterQuestions = useMemo(
    () => starterQuestionsInput.split("\n").map((item) => item.trim()).filter(Boolean),
    [starterQuestionsInput],
  );

  const selectedChatbot = useMemo(
    () => chatbots.find((item) => item.id === selectedChatbotId) ?? null,
    [chatbots, selectedChatbotId],
  );
  const visibleLauncherImageIcons = useMemo(
    () => mergeVisibleLauncherIcons(launcherImageIcons),
    [launcherImageIcons],
  );
  const selectedManagedIcon = useMemo(
    () => visibleLauncherImageIcons.find((item) => item.url === launcherIconUrl) ?? null,
    [launcherIconUrl, visibleLauncherImageIcons],
  );

  const previewInstitutionName = institutionName.trim() || "기관";
  const previewChatbotName = chatbotDisplayName.trim() || selectedChatbot?.name || previewInstitutionName;
  const previewLauncher = launcherLabel.trim() || "챗봇 열기";
  const previewUsesImageLauncher =
    launcherIcon === "love-chat" || (launcherIcon === "custom" && launcherIconUrl.trim().length > 0);
  const previewIntro =
    introMessage.trim() ||
    `안녕하세요\n${previewChatbotName} AI 챗봇입니다.\n\n궁금하신 내용을 입력해주시면\n빠르게 안내해드리겠습니다.`;
  const previewHoverMessage =
    launcherHoverMessage.trim() || `AI챗봇 ${previewInstitutionName}예요. 무엇을 도와드릴까요?`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedIframeState({
        selectedChatbotId,
        chatbotName: previewChatbotName,
        chatbotDisplayName: previewChatbotName,
        institutionName: previewInstitutionName,
        logoUrl: logoUrl.trim(),
        introMessage: introMessage.trim(),
        themeColor: themeColor.trim() || "#2563EB",
        colorPreset,
        welcomeMessage: welcomeMessage.trim(),
        bannerTitle: bannerTitle.trim(),
        bannerDescription: bannerDescription.trim(),
        launcherIcon,
        launcherIconUrl: launcherIconUrl.trim(),
        launcherHoverMessage: previewHoverMessage,
        starterQuestions,
      });
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [
    bannerDescription,
    bannerTitle,
    colorPreset,
    introMessage,
    launcherIcon,
    launcherIconUrl,
    logoUrl,
    previewHoverMessage,
    previewChatbotName,
    previewInstitutionName,
    selectedChatbot?.name,
    selectedChatbotId,
    starterQuestions,
    themeColor,
    welcomeMessage,
  ]);

  const iframeSrcDoc = useMemo(() => {
    if (!debouncedIframeState.selectedChatbotId.trim()) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const payload = {
      chatbotId: debouncedIframeState.selectedChatbotId,
      chatbotName: debouncedIframeState.chatbotName,
      institutionName: debouncedIframeState.institutionName,
      logoUrl: debouncedIframeState.logoUrl || null,
      introMessage: debouncedIframeState.introMessage || null,
      welcomeMessage: debouncedIframeState.welcomeMessage || previewIntro,
      privacyNotice: null,
      citationMode: "optional",
      theme: {
        primaryColor: debouncedIframeState.themeColor || "#2563EB",
        textColor: null,
        backgroundColor: null,
        preset: debouncedIframeState.colorPreset,
        launcherIcon: debouncedIframeState.launcherIcon,
        launcherIconUrl: debouncedIframeState.launcherIconUrl || null,
      },
      banner: {
        title: debouncedIframeState.bannerTitle || null,
        description: debouncedIframeState.bannerDescription || null,
      },
      starterQuestions: debouncedIframeState.starterQuestions,
      launcherHoverMessage: debouncedIframeState.launcherHoverMessage,
      quickActions: [],
      operatingHours: { isAfterHours: false, message: null },
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
      html, body { margin: 0; min-height: 100%; background: radial-gradient(circle at top, rgba(59,130,246,0.10), transparent 42%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); }
      body { position: relative; font-family: Pretendard, "Noto Sans KR", sans-serif; }
    </style>
  </head>
  <body>
    <script>
      const __IEUMBOT_PREVIEW_CONFIG__ = ${serialized};
      const __originalFetch__ = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (url.includes("/widget/config/${debouncedIframeState.selectedChatbotId}")) {
          return new Response(JSON.stringify(__IEUMBOT_PREVIEW_CONFIG__), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return __originalFetch__(input, init);
      };
    </script>
    <script src="/widget.js" data-chatbot-id="${debouncedIframeState.selectedChatbotId}" data-api-base-url="${origin}/api" data-open-on-load="true"></script>
  </body>
</html>`;
  }, [
    previewIntro,
    debouncedIframeState,
  ]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      setIsBooting(true);
      setError(null);
      try {
        const response = await getAdminChatbots();
        if (cancelled) return;
        setChatbots(response.items);
        if (response.items[0]) {
          setSelectedChatbotId((current) => current || response.items[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLauncherIcons = async () => {
      try {
        const items = await listAdminWidgetIcons();
        if (!cancelled) {
          setLauncherImageIcons(items);
        }
      } catch (err) {
        if (!cancelled) {
          setLauncherImageIcons([]);
          setError(getErrorMessage(err));
        }
      }
    };
    void loadLauncherIcons();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChatbotId) return;
    let cancelled = false;
    const loadWidget = async () => {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await getAdminWidget(selectedChatbotId);
        if (cancelled) return;
        setData(res);
        setDomainsInput((res.allowedDomains ?? []).join(", "));
        setLauncherLabel(res.launcherLabel ?? "");
        const nextLauncherIcon =
          res.launcherIcon === "love-chat"
            ? "custom"
            : res.launcherIcon === "custom" && !(res.launcherIconUrl ?? "").trim()
              ? "chat"
              : (res.launcherIcon ?? "chat");
        const nextLauncherIconUrl =
          res.launcherIcon === "love-chat"
            ? LOVE_CHAT_ICON_SRC
            : (res.launcherIconUrl ?? "");
        setLauncherIcon(nextLauncherIcon);
        setLauncherIconUrl(nextLauncherIconUrl);
        setLauncherHoverMessage(res.launcherHoverMessage ?? "");
        setChatbotDisplayName(res.chatbotDisplayName ?? "");
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
        if (!cancelled) {
          setError(getErrorMessage(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadWidget();
    return () => {
      cancelled = true;
    };
  }, [selectedChatbotId]);

  const saveSettings = async () => {
    if (!selectedChatbotId) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const allowedDomains = domainsInput.split(",").map((item) => item.trim()).filter(Boolean);
      const res = await patchAdminWidget(selectedChatbotId, {
        allowedDomains,
        launcherLabel: launcherLabel.trim(),
        launcherIcon,
        launcherIconUrl: launcherIconUrl.trim(),
        launcherHoverMessage: launcherHoverMessage.trim(),
        chatbotDisplayName: chatbotDisplayName.trim(),
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
    if (!selectedChatbotId) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await patchAdminWidget(selectedChatbotId, { isActive: nextValue });
      setData(res);
      setSuccess(nextValue ? "위젯을 활성화했습니다." : "위젯을 비활성화했습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleLauncherIconUpload = async () => {
    if (!launcherIconFile) return;
    setIsUploadingIcon(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await uploadAdminWidgetIcon(launcherIconFile);
      const nextItems = await listAdminWidgetIcons();
      setLauncherImageIcons(nextItems);
      setLauncherIcon("custom");
      setLauncherIconUrl(created.url);
      setLauncherIconFile(null);
      setLauncherIconInputKey((current) => current + 1);
      setSuccess("런처 아이콘을 등록했습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleLauncherIconDelete = async (iconUrl: string) => {
    setDeletingIconUrl(iconUrl);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminWidgetIcon(iconUrl);
      const nextItems = await listAdminWidgetIcons();
      setLauncherImageIcons(nextItems);
      if (launcherIcon === "custom" && launcherIconUrl === iconUrl) {
        setLauncherIcon("chat");
        setLauncherIconUrl("");
      }
      setSuccess("런처 아이콘을 삭제했습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingIconUrl(null);
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel
        title="위젯 설정"
        description="생성된 챗봇을 선택해 위젯 아이콘, hover 안내 말풍선, 브랜드 설정과 미리보기를 함께 관리합니다."
      >
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">챗봇 선택</p>
              <p className="mt-1 text-xs text-slate-500">위젯을 연결할 챗봇을 카드에서 바로 선택하세요.</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              선택된 ID: {selectedChatbotId || "-"}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {chatbots.map((chatbot) => {
              const active = chatbot.id === selectedChatbotId;
              return (
                <button
                  key={chatbot.id}
                  type="button"
                  onClick={() => setSelectedChatbotId(chatbot.id)}
                  className={[
                    "rounded-2xl border p-4 text-left transition",
                    active ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{chatbot.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{chatbot.id}</p>
                    </div>
                    <span className={["rounded-full px-2.5 py-1 text-[11px] font-medium", chatbot.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"].join(" ")}>
                      {chatbot.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] text-slate-500">문서</p>
                      <p className="mt-1 font-semibold text-slate-900">{chatbot.documentCount}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] text-slate-500">웹사이트</p>
                      <p className="mt-1 font-semibold text-slate-900">{chatbot.websiteCount}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {isBooting ? <p className="text-sm text-slate-600">챗봇 목록을 불러오는 중...</p> : null}
        {isLoading ? <p className="text-sm text-slate-600">위젯 설정을 불러오는 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {!isBooting && chatbots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            먼저 챗봇을 생성한 뒤 위젯 설정을 진행해 주세요.
          </div>
        ) : null}

        {data ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">현재 실제 사용 중인 AI 런타임</p>
                    <p className="mt-1 text-xs text-slate-500">슈퍼관리자 기본 API 설정과 챗봇 답변 설정을 합쳐 계산한 현재 기준입니다.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      provider: {data.runtimeProvider ?? "-"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      model: {data.runtimeModel ?? "-"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      source: {data.runtimeSource ?? "-"}
                    </span>
                  </div>
                </div>
                {data.runtimeProvider === "openai" ? (
                  <div
                    className={[
                      "mt-3 rounded-2xl border px-4 py-3 text-xs leading-5",
                      data.runtimeModelRecommended
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700",
                    ].join(" ")}
                  >
                    {data.runtimeModelRecommended
                      ? "현재 OpenAI 권장 기본 모델 범위(gpt-4.1-mini 또는 gpt-4.1)로 설정되어 있습니다."
                      : "현재 OpenAI는 사용 중이지만 모델이 권장 기본값(gpt-4.1-mini 또는 gpt-4.1)이 아닙니다. /admin/answer-settings 에서 modelName을 확인해 주세요."}
                  </div>
                ) : null}
              </div>

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
                  <input value={domainsInput} onChange={(event) => setDomainsInput(event.target.value)} placeholder="example.go.kr, portal.example.go.kr" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">플로팅 버튼 라벨</span>
                  <input value={launcherLabel} onChange={(event) => setLauncherLabel(event.target.value)} placeholder="AI 상담 챗봇" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">기관명</span>
                  <input value={institutionName} onChange={(event) => setInstitutionName(event.target.value)} placeholder="해외농업길라잡이" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">챗봇명</span>
                  <input value={chatbotDisplayName} onChange={(event) => setChatbotDisplayName(event.target.value)} placeholder={selectedChatbot?.name ?? "AI 상담 챗봇"} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">런처 아이콘 선택</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {LAUNCHER_ICONS.map((item) => {
                    const active = launcherIcon === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setLauncherIcon(item.value)}
                        className={[
                          "rounded-2xl border p-3 text-center transition",
                          active ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-green-500 text-white shadow-sm">
                          {getLauncherIconNode(item.value)}
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-900">{item.label}</p>
                      </button>
                    );
                  })}
                  {visibleLauncherImageIcons.map((item) => {
                    const active = launcherIcon === "custom" && launcherIconUrl === item.url;
                    return (
                      <div
                        key={item.url}
                        className={[
                          "relative rounded-2xl border p-3 text-center transition",
                          active ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setLauncherIcon("custom");
                            setLauncherIconUrl(item.url);
                          }}
                          className="block w-full"
                        >
                          <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                            <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                          </div>
                          <p className="mt-3 line-clamp-2 text-xs font-semibold text-slate-900">{item.name}</p>
                        </button>
                        {item.deletable ? (
                          <button
                            type="button"
                            onClick={() => void handleLauncherIconDelete(item.url)}
                            disabled={deletingIconUrl === item.url}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                            aria-label={`${item.name} 삭제`}
                          >
                            <CloseIcon />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {launcherIcon === "custom" && launcherIconUrl && !selectedManagedIcon ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    현재 선택된 아이콘 URL은 관리 목록에 없습니다. 새 아이콘을 업로드하거나 다른 아이콘을 선택해 주세요.
                  </div>
                ) : null}
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-700">파일 첨부로 런처 아이콘 추가</p>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                    <input
                      key={launcherIconInputKey}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      onChange={(event) => setLauncherIconFile(event.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => void handleLauncherIconUpload()}
                      disabled={!launcherIconFile || isUploadingIcon}
                      className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {isUploadingIcon ? "업로드 중..." : "아이콘 등록"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">등록한 아이콘은 바로 런처 아이콘 목록에 추가되고 선택하거나 삭제할 수 있습니다.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">hover 안내 말풍선 문구</span>
                  <textarea
                    value={launcherHoverMessage}
                    onChange={(event) => setLauncherHoverMessage(event.target.value)}
                    rows={2}
                    placeholder="AI챗봇 해외농업길라잡이예요. 무엇을 도와드릴까요?"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">로고 URL</span>
                  <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">대표 색상</span>
                  <input value={themeColor} onChange={(event) => setThemeColor(event.target.value)} placeholder="#2563EB" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">기관별 컬러 프리셋</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {COLOR_PRESETS.map((preset) => {
                    const active = colorPreset === preset.value;
                    return (
                      <button key={preset.value} type="button" onClick={() => setColorPreset(preset.value)} className={`rounded-2xl border p-3 text-left transition ${active ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
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
                  <textarea value={introMessage} onChange={(event) => setIntroMessage(event.target.value)} rows={4} placeholder="채팅창이 열릴 때 처음 보여줄 안내 문구" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">상단 안내 배너 제목</span>
                  <input value={bannerTitle} onChange={(event) => setBannerTitle(event.target.value)} placeholder="해외농업 관련 문의를 도와드립니다" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">상단 안내 배너 설명</span>
                  <textarea value={bannerDescription} onChange={(event) => setBannerDescription(event.target.value)} rows={3} placeholder="운영시간, 상담 범위, 응답 안내 등을 입력하세요." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">대화 시작 추천 질문 카드</span>
                  <textarea value={starterQuestionsInput} onChange={(event) => setStarterQuestionsInput(event.target.value)} rows={5} placeholder={`주요 사업이 궁금해요\n지원 대상이 누구인가요?\n신청 절차를 알려주세요`} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  <p className="text-xs text-slate-500">한 줄에 하나씩 입력하면 시작 질문 카드로 노출됩니다.</p>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">기본 환영 메시지</span>
                  <textarea value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value)} rows={3} placeholder="공개 위젯 config의 기본 welcome 메시지" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={isSaving} onClick={() => void saveSettings()} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {isSaving ? "저장 중..." : "설정 저장"}
                </button>
                <button type="button" onClick={() => void toggleActive(true)} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">
                  활성화
                </button>
                <button type="button" onClick={() => void toggleActive(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">
                  비활성화
                </button>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600">설치 스크립트</p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{data.installScript ?? "등록된 스크립트가 없습니다."}</pre>
              </div>
            </div>

            <div className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">실시간 미리보기</p>
                  <p className="mt-1 text-xs text-slate-500">런처 아이콘 확대, hover 말풍선, 채팅창 구성을 한 번에 확인할 수 있습니다.</p>
                </div>
                <div className="relative min-h-[680px] overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.10),_transparent_42%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-5">
                  <div className="absolute bottom-24 right-6 max-w-[280px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
                    <button type="button" className="absolute right-2 top-2 rounded-full bg-slate-100 p-1 text-slate-500">
                      <CloseIcon />
                    </button>
                    <p className="pr-6 text-sm leading-6 text-slate-700">{previewHoverMessage}</p>
                  </div>

                  <div
                    className={`absolute bottom-6 right-6 flex h-16 w-16 items-center justify-center rounded-full transition hover:scale-105 ${
                      previewUsesImageLauncher
                        ? "bg-transparent text-transparent shadow-none"
                        : "bg-gradient-to-br from-blue-600 to-green-500 text-white shadow-lg hover:shadow-xl"
                    }`}
                  >
                    {getLauncherIconNode(launcherIcon, launcherIconUrl)}
                  </div>

                  <div className="absolute right-5 top-5 flex w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
                    <div className={`flex min-h-[60px] items-center justify-between bg-gradient-to-br ${gradientClass(colorPreset)} px-4 py-3 text-white`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                          {logoUrl.trim() ? <img src={logoUrl.trim()} alt="기관 로고" className="h-5 w-5 rounded-full object-contain" /> : <ChatIcon />}
                        </div>
                        <div className="truncate text-sm font-semibold">{`AI 챗봇 ${previewChatbotName}`}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><MinimizeIcon /></button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><CloseIcon /></button>
                      </div>
                    </div>

                    {(bannerTitle.trim() || bannerDescription.trim()) && (
                      <div className="m-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-white to-blue-50 px-4 py-3">
                        {bannerTitle.trim() ? <p className="text-xs font-bold text-blue-900">{bannerTitle.trim()}</p> : null}
                        {bannerDescription.trim() ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{bannerDescription.trim()}</p> : null}
                      </div>
                    )}

                    <div className="flex flex-1 flex-col gap-3 bg-slate-50 px-4 pb-4 pt-0">
                      <div className="rounded-2xl bg-white px-4 py-3 text-[13px] leading-6 text-slate-900 shadow-sm">
                        <div className="whitespace-pre-wrap">{previewIntro}</div>
                      </div>
                      {starterQuestions.length > 0 ? (
                        <div className="grid gap-2">
                          {starterQuestions.slice(0, 4).map((question) => (
                            <button key={question} type="button" className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-sm">
                              {question}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-h-16 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
                      <div className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-xs text-slate-400">무엇을 도와드릴까요?</div>
                      <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"><SendIcon /></button>
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
                  <p className="mt-1 text-xs text-slate-500">iframe 안에서 실제 위젯 스크립트를 실행해 hover 말풍선과 아이콘도 그대로 확인합니다.</p>
                </div>
                {selectedChatbotId ? (
                  <iframe title="IEUMBOT widget iframe preview" srcDoc={iframeSrcDoc} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" className="h-[680px] w-full rounded-2xl border border-slate-200 bg-white" />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    챗봇을 선택하면 실제 widget.js iframe 미리보기를 확인할 수 있습니다.
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

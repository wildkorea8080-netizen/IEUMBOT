"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PagePanel } from "../ui/page-panel";
import { ApiClientError } from "../../lib/api";
import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";
import {
  createKnowledgeText,
  createKnowledgeWebsite,
  getAdminChatbots,
  getKnowledgeRuntimeStatus,
  uploadKnowledgeFile,
} from "../../lib/api/admin-operations";
import type {
  AdminChatbotItem,
  KnowledgeDetail,
  KnowledgeRuntimeStatus,
} from "../../lib/api/admin-operations-types";

type CommonFormState = {
  chatbotId: string;
  title: string;
  category: string;
  field: string;
  tags: string;
  memo: string;
  effectiveDate: string;
  department: string;
};

type TextFormState = CommonFormState & {
  content: string;
};

type WebsiteFormState = {
  chatbotId: string;
  title: string;
  url: string;
  crawlPageLimit: string;
  crawlAllPages: boolean;
  includeAttachments: boolean;
  excludedPaths: string;
  category: string;
  field: string;
  tags: string;
  memo: string;
  department: string;
};

function emptyCommonForm(chatbotId = ""): CommonFormState {
  return {
    chatbotId,
    title: "",
    category: "",
    field: "",
    tags: "",
    memo: "",
    effectiveDate: "",
    department: "",
  };
}

function emptyWebsiteForm(chatbotId = ""): WebsiteFormState {
  return {
    chatbotId,
    title: "",
    url: "",
    crawlPageLimit: "300",
    crawlAllPages: true,
    includeAttachments: true,
    excludedPaths: "",
    category: "",
    field: "",
    tags: "",
    memo: "",
    department: "",
  };
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseExcludedPaths(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "WEBSITE_ALREADY_REGISTERED") {
      return "이미 등록된 웹사이트입니다. 동일한 챗봇에는 같은 URL을 중복 등록할 수 없습니다.";
    }
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "지식 등록에 실패했습니다.";
}

function statusBadgeClass(status: string): string {
  if (status === "ready") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "inactive") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-700";
}

function RegisterTypeButton(props: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-2xl border p-5 text-left transition ${
        props.active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{props.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{props.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            props.active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          선택
        </span>
      </div>
    </button>
  );
}

function CommonFields(props: {
  form: CommonFormState;
  chatbots: AdminChatbotItem[];
  onChange: (key: keyof CommonFormState, value: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">챗봇</span>
        <select
          value={props.form.chatbotId}
          onChange={(event) => props.onChange("chatbotId", event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">챗봇 선택</option>
          {props.chatbots.map((chatbot) => (
            <option key={chatbot.id} value={chatbot.id}>
              {chatbot.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">제목</span>
        <input
          value={props.form.title}
          onChange={(event) => props.onChange("title", event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="제목 입력"
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">카테고리</span>
        <input
          value={props.form.category}
          onChange={(event) => props.onChange("category", event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="정책, 공지"
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">분야</span>
        <input
          value={props.form.field}
          onChange={(event) => props.onChange("field", event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="복지, 교통"
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">태그</span>
        <input
          value={props.form.tags}
          onChange={(event) => props.onChange("tags", event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="쉼표로 구분"
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">부서</span>
        <input
          value={props.form.department}
          onChange={(event) => props.onChange("department", event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="담당 부서"
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">시행일</span>
        <input
          type="date"
          value={props.form.effectiveDate}
          onChange={(event) => props.onChange("effectiveDate", event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="space-y-2 md:col-span-2">
        <span className="text-sm font-medium text-slate-700">메모</span>
        <textarea
          value={props.form.memo}
          onChange={(event) => props.onChange("memo", event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="운영 메모"
        />
      </label>
    </div>
  );
}

export function KnowledgeRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedType, setSelectedType] = useState<"file" | "text" | "website">("file");
  const [fileForm, setFileForm] = useState<CommonFormState>(emptyCommonForm());
  const [textForm, setTextForm] = useState<TextFormState>({ ...emptyCommonForm(), content: "" });
  const [websiteForm, setWebsiteForm] = useState<WebsiteFormState>(emptyWebsiteForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useVision, setUseVision] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeDetail | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<KnowledgeRuntimeStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await getAdminChatbots();
        const runtime = await getKnowledgeRuntimeStatus();
        if (!mounted) return;
        setChatbots(response.items);
        setRuntimeStatus(runtime);
        const defaultChatbotId = response.items[0]?.id ?? "";
        const prefill = searchParams.get("prefill");
        const type = searchParams.get("type");
        setFileForm(emptyCommonForm(defaultChatbotId));
        setTextForm({
          ...emptyCommonForm(defaultChatbotId),
          title: prefill && type === "text" ? prefill : "",
          content: prefill && type === "text" ? `Q: ${prefill}\nA: ` : "",
        });
        setWebsiteForm(emptyWebsiteForm(defaultChatbotId));
        if (prefill && type === "text") {
          setSelectedType("text");
        }
      } catch (loadError) {
        if (mounted) setError(getErrorMessage(loadError));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [searchParams]);

  useEffect(() => {
    const activeChatbotId =
      selectedType === "file"
        ? fileForm.chatbotId
        : selectedType === "text"
          ? textForm.chatbotId
          : websiteForm.chatbotId;
    const chatbot = chatbots.find((item) => item.id === activeChatbotId);
    if (chatbot) {
      writeSelectedAdminChatbot({ id: chatbot.id, name: chatbot.name });
    }
  }, [chatbots, fileForm.chatbotId, selectedType, textForm.chatbotId, websiteForm.chatbotId]);

  const submitFile = async () => {
    if (!selectedFile) {
      setError("업로드할 파일을 선택해주세요.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await uploadKnowledgeFile({
        chatbotId: fileForm.chatbotId,
        file: selectedFile,
        title: fileForm.title,
        category: fileForm.category || undefined,
        field: fileForm.field || undefined,
        tags: parseTags(fileForm.tags),
        memo: fileForm.memo || undefined,
        effectiveDate: fileForm.effectiveDate || undefined,
        department: fileForm.department || undefined,
        use_vision: useVision,
      });
      setResult(response);
      setSelectedFile(null);
      setUseVision(false);
      window.setTimeout(() => router.push("/admin/knowledge/list"), 900);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitText = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await createKnowledgeText({
        chatbotId: textForm.chatbotId,
        title: textForm.title,
        content: textForm.content,
        category: textForm.category || undefined,
        field: textForm.field || undefined,
        tags: parseTags(textForm.tags),
        memo: textForm.memo || undefined,
        effectiveDate: textForm.effectiveDate || undefined,
        department: textForm.department || undefined,
      });
      setResult(response);
      window.setTimeout(() => router.push("/admin/knowledge/list"), 900);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitWebsite = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await createKnowledgeWebsite({
        chatbotId: websiteForm.chatbotId,
        url: websiteForm.url,
        title: websiteForm.title,
        crawlPageLimit: Number(websiteForm.crawlPageLimit) || 300,
        crawlAllPages: websiteForm.crawlAllPages,
        includeAttachments: websiteForm.includeAttachments,
        excludedPaths: parseExcludedPaths(websiteForm.excludedPaths),
        category: websiteForm.category || undefined,
        field: websiteForm.field || undefined,
        tags: parseTags(websiteForm.tags),
        memo: websiteForm.memo || undefined,
        department: websiteForm.department || undefined,
      });
      setResult(response);
      window.setTimeout(() => router.push("/admin/knowledge/list"), 900);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PagePanel
        title="지식 등록"
        description="파일, 텍스트, 공식 웹사이트를 등록하고 바로 수집 상태를 추적합니다."
      >
        {runtimeStatus ? (
          <div
            className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
              runtimeStatus.scannedPdfReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <strong>PDF OCR 상태</strong>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  runtimeStatus.scannedPdfReady ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                }`}
              >
                {runtimeStatus.scannedPdfReady ? "스캔 PDF 처리 가능" : "스캔 PDF 처리 미완료"}
              </span>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <p className="font-medium">Python 패키지</p>
                <p className="mt-1">
                  pypdf {runtimeStatus.pythonPackages.pypdf?.installed ? "OK" : "MISSING"} / pdf2image{" "}
                  {runtimeStatus.pythonPackages.pdf2image?.installed ? "OK" : "MISSING"} / pytesseract{" "}
                  {runtimeStatus.pythonPackages.pytesseract?.installed ? "OK" : "MISSING"} / Pillow{" "}
                  {runtimeStatus.pythonPackages.PIL?.installed ? "OK" : "MISSING"}
                </p>
              </div>
              <div>
                <p className="font-medium">시스템 도구</p>
                <p className="mt-1">
                  tesseract {runtimeStatus.systemBinaries.tesseract?.installed ? "OK" : "MISSING"} / pdftoppm{" "}
                  {runtimeStatus.systemBinaries.pdftoppm?.installed ? "OK" : "MISSING"} / pdfinfo{" "}
                  {runtimeStatus.systemBinaries.pdfinfo?.installed ? "OK" : "MISSING"}
                </p>
              </div>
            </div>
            {runtimeStatus.notes.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {runtimeStatus.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <RegisterTypeButton
            title="파일 업로드"
            description="정책 문서, 공지, 운영 가이드를 업로드합니다."
            active={selectedType === "file"}
            onClick={() => setSelectedType("file")}
          />
          <RegisterTypeButton
            title="텍스트 붙여넣기"
            description="즉시 공지나 기준 텍스트 지식을 등록합니다."
            active={selectedType === "text"}
            onClick={() => setSelectedType("text")}
          />
          <RegisterTypeButton
            title="웹사이트 등록"
            description="공식 URL을 등록하고 하위 링크까지 수집 범위를 설정합니다."
            active={selectedType === "website"}
            onClick={() => setSelectedType("website")}
          />
        </div>
      </PagePanel>

      <PagePanel
        title={selectedType === "file" ? "파일 폼" : selectedType === "text" ? "텍스트 폼" : "웹사이트 폼"}
        description="등록 후 목록 화면에서 색인 상태와 상세 정보를 바로 확인할 수 있습니다."
      >
        {isLoading ? <p className="text-sm text-slate-500">챗봇 목록을 불러오는 중입니다.</p> : null}
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {!isLoading && selectedType === "file" ? (
          <div className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">파일 선택</span>
              <input
                type="file"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setSelectedFile(nextFile);
                  if (!nextFile?.name.toLowerCase().endsWith(".pdf")) {
                    setUseVision(false);
                  }
                }}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"
              />
            </label>
            {selectedFile && selectedFile.name.toLowerCase().endsWith(".pdf") && (
              <div style={{ marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={useVision}
                    onChange={(event) => setUseVision(event.target.checked)}
                  />
                  <span style={{ fontSize: 14 }}>Vision 학습 사용</span>
                </label>
                <p style={{ fontSize: 12, color: "#888", marginTop: 4, marginLeft: 24 }}>
                  표·이미지가 포함된 PDF나 스캔 문서에 권장합니다. 처리 시간이 길어질 수 있습니다.
                </p>
              </div>
            )}
            <CommonFields
              form={fileForm}
              chatbots={chatbots}
              onChange={(key, value) => setFileForm((current) => ({ ...current, [key]: value }))}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void submitFile()}
                disabled={isSubmitting}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                파일 등록
              </button>
            </div>
          </div>
        ) : null}

        {!isLoading && selectedType === "text" ? (
          <div className="space-y-4">
            <CommonFields
              form={textForm}
              chatbots={chatbots}
              onChange={(key, value) => setTextForm((current) => ({ ...current, [key]: value }))}
            />
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">본문</span>
              <textarea
                value={textForm.content}
                onChange={(event) => setTextForm((current) => ({ ...current, content: event.target.value }))}
                rows={12}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="여기에 내용을 붙여넣어 주세요"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void submitText()}
                disabled={isSubmitting}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                텍스트 등록
              </button>
            </div>
          </div>
        ) : null}

        {!isLoading && selectedType === "website" ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">챗봇</span>
                <select
                  value={websiteForm.chatbotId}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, chatbotId: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">챗봇 선택</option>
                  {chatbots.map((chatbot) => (
                    <option key={chatbot.id} value={chatbot.id}>
                      {chatbot.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">URL</span>
                <input
                  value={websiteForm.url}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, url: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="https://"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">제목</span>
                <input
                  value={websiteForm.title}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">크롤링 페이지 수</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={websiteForm.crawlPageLimit}
                  onChange={(event) =>
                    setWebsiteForm((current) => ({ ...current, crawlPageLimit: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={websiteForm.crawlAllPages}
                  onChange={(event) =>
                    setWebsiteForm((current) => ({ ...current, crawlAllPages: event.target.checked }))
                  }
                />
                <span className="text-sm font-medium text-slate-700">같은 도메인의 하위 페이지 전체 수집</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={websiteForm.includeAttachments}
                  onChange={(event) =>
                    setWebsiteForm((current) => ({ ...current, includeAttachments: event.target.checked }))
                  }
                />
                <span className="text-sm font-medium text-slate-700">링크된 PDF/문서 첨부파일도 색인</span>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">카테고리</span>
                <input
                  value={websiteForm.category}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, category: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">분야</span>
                <input
                  value={websiteForm.field}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, field: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">부서</span>
                <input
                  value={websiteForm.department}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, department: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">제외 경로</span>
                <textarea
                  value={websiteForm.excludedPaths}
                  onChange={(event) =>
                    setWebsiteForm((current) => ({ ...current, excludedPaths: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder={"/login\n/board/history"}
                />
                <p className="text-xs text-slate-500">줄바꿈 또는 쉼표로 여러 경로를 입력할 수 있습니다.</p>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">태그</span>
                <input
                  value={websiteForm.tags}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, tags: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="쉼표로 구분"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">메모</span>
                <textarea
                  value={websiteForm.memo}
                  onChange={(event) => setWebsiteForm((current) => ({ ...current, memo: event.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void submitWebsite()}
                disabled={isSubmitting}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                웹사이트 등록
              </button>
            </div>
          </div>
        ) : null}
      </PagePanel>

      {result ? (
        <PagePanel title="등록 결과" description="등록 후 목록 화면에서 상세 항목과 색인 상태를 추적할 수 있습니다.">
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-base text-slate-900">{result.title}</strong>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(result.status)}`}>
              {result.status}
            </span>
            {result.ingestionStatus ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                Index {result.ingestionStatus}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-slate-600">{result.summary ?? "Registration completed."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              잠시 후 지식 목록으로 이동합니다.
            </span>
            <Link href="/admin/knowledge/list" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              관리 화면으로 이동
            </Link>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              계속
            </button>
          </div>
        </PagePanel>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Upload, FileText, Globe, CheckCircle, Save,
  Loader2,
} from "lucide-react";

import { ApiClientError } from "../../lib/api";
import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";
import {
  createKnowledgeText,
  createKnowledgeWebsite,
  getAdminChatbots,
  getKnowledgeDetail,
  getKnowledgeRuntimeStatus,
  uploadKnowledgeFile,
} from "../../lib/api/admin-operations";
import type {
  AdminChatbotItem,
  KnowledgeDetail,
  KnowledgeRuntimeStatus,
} from "../../lib/api/admin-operations-types";

// ── 타입 ─────────────────────────────────────────────────

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

type TextFormState = CommonFormState & { content: string };

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

// ── 유틸 ─────────────────────────────────────────────────

function emptyCommonForm(chatbotId = ""): CommonFormState {
  return { chatbotId, title: "", category: "", field: "", tags: "", memo: "", effectiveDate: "", department: "" };
}
function emptyWebsiteForm(chatbotId = ""): WebsiteFormState {
  return { chatbotId, title: "", url: "", crawlPageLimit: "300", crawlAllPages: true, includeAttachments: true, excludedPaths: "", category: "", field: "", tags: "", memo: "", department: "" };
}
function parseTags(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
function parseExcludedPaths(value: string): string[] {
  return value.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
}
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "WEBSITE_ALREADY_REGISTERED") return "이미 등록된 웹사이트입니다. 동일한 챗봇에는 같은 URL을 중복 등록할 수 없습니다.";
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "지식 등록에 실패했습니다.";
}
function statusBadgeClass(status: string): string {
  if (status === "ready" || status === "completed") return "badge-success";
  if (status === "processing" || status === "queued") return "badge-warning";
  if (status === "failed") return "badge-danger";
  return "badge-neutral";
}
function statusLabel(status?: string | null): string {
  if (!status) return "-";
  const map: Record<string, string> = { queued: "대기 중", processing: "학습 중", completed: "완료", ready: "완료", failed: "실패", inactive: "비활성" };
  return map[status] ?? status;
}

// ── 타입 선택 카드 ────────────────────────────────────────

type RegisterType = "file" | "text" | "website";

const TYPE_META: Record<RegisterType, { icon: React.ReactNode; title: string; desc: string; support: string; supportVariant: "success" | "neutral" }> = {
  file: {
    icon: <Upload style={{ width: 32, height: 32 }} />,
    title: "파일 업로드",
    desc: "PDF, DOCX, HWP, XLSX 등\n문서 파일을 업로드합니다",
    support: "Vision 학습 지원",
    supportVariant: "success",
  },
  text: {
    icon: <FileText style={{ width: 32, height: 32 }} />,
    title: "텍스트 입력",
    desc: "자주 묻는 질문이나 안내문을\n직접 입력해 등록합니다",
    support: "FAQ 작성에 최적",
    supportVariant: "neutral",
  },
  website: {
    icon: <Globe style={{ width: 32, height: 32 }} />,
    title: "웹사이트",
    desc: "웹페이지 URL을 등록하면\nAI가 자동으로 학습합니다",
    support: "자동 크롤링 지원",
    supportVariant: "success",
  },
};

function TypeCard({ type, selected, onClick }: { type: RegisterType; selected: boolean; onClick: () => void }) {
  const meta = TYPE_META[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left transition-all duration-150"
      style={{
        background: selected ? "#eff6ff" : "white",
        border: `2px solid ${selected ? "#2563eb" : "#e2e8f0"}`,
        borderRadius: 16,
        padding: 24,
        cursor: "pointer",
        boxShadow: selected ? "0 0 0 4px rgba(37,99,235,0.08)" : undefined,
      }}
    >
      {selected && (
        <CheckCircle style={{ position: "absolute", top: 16, right: 16, width: 20, height: 20, color: "#2563eb" }} />
      )}
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: selected ? "#dbeafe" : "#eff6ff",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#2563eb", marginBottom: 16,
      }}>
        {meta.icon}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{meta.title}</div>
      <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, whiteSpace: "pre-line" }}>{meta.desc}</div>
      <div style={{ marginTop: 12 }}>
        <span className={meta.supportVariant === "success" ? "badge-success" : "badge-neutral"} style={{ fontSize: 11 }}>
          {meta.support}
        </span>
      </div>
    </button>
  );
}

// ── 공통 필드 ─────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span style={{ fontSize: 14, fontWeight: 500, color: "#334155", display: "block", marginBottom: 6 }}>
      {children}
      {required && <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>}
    </span>
  );
}

function CommonFields({ form, chatbots, onChange }: {
  form: CommonFormState;
  chatbots: AdminChatbotItem[];
  onChange: (key: keyof CommonFormState, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label>
        <Label required>챗봇 선택</Label>
        <select value={form.chatbotId} onChange={e => onChange("chatbotId", e.target.value)} className="input-field">
          <option value="">챗봇 선택</option>
          {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        <Label required>제목</Label>
        <input value={form.title} onChange={e => onChange("title", e.target.value)} className="input-field" placeholder="제목 입력" />
      </label>
      <label>
        <Label>카테고리</Label>
        <input value={form.category} onChange={e => onChange("category", e.target.value)} className="input-field" placeholder="정책, 공지" />
      </label>
      <label>
        <Label>분야</Label>
        <input value={form.field} onChange={e => onChange("field", e.target.value)} className="input-field" placeholder="복지, 교통" />
      </label>
      <label>
        <Label>태그</Label>
        <input value={form.tags} onChange={e => onChange("tags", e.target.value)} className="input-field" placeholder="쉼표로 구분" />
      </label>
      <label>
        <Label>담당 부서</Label>
        <input value={form.department} onChange={e => onChange("department", e.target.value)} className="input-field" placeholder="담당 부서" />
      </label>
      <label>
        <Label>시행일</Label>
        <input type="date" value={form.effectiveDate} onChange={e => onChange("effectiveDate", e.target.value)} className="input-field" />
      </label>
      <label className="md:col-span-2">
        <Label>메모</Label>
        <textarea value={form.memo} onChange={e => onChange("memo", e.target.value)} rows={3} className="input-field" placeholder="운영 메모" />
      </label>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────

export function KnowledgeRegister() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedType, setSelectedType] = useState<RegisterType>("file");
  const [fileForm, setFileForm] = useState<CommonFormState>(emptyCommonForm());
  const [textForm, setTextForm] = useState<TextFormState>({ ...emptyCommonForm(), content: "" });
  const [websiteForm, setWebsiteForm] = useState<WebsiteFormState>(emptyWebsiteForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useVision, setUseVision] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeDetail | null>(null);
  const [trackedResult, setTrackedResult] = useState<KnowledgeDetail | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<KnowledgeRuntimeStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [response, runtime] = await Promise.all([getAdminChatbots(), getKnowledgeRuntimeStatus()]);
        if (!mounted) return;
        setChatbots(response.items);
        setRuntimeStatus(runtime);
        const defaultChatbotId = response.items[0]?.id ?? "";
        const prefill = searchParams.get("prefill");
        const type = searchParams.get("type");
        setFileForm(emptyCommonForm(defaultChatbotId));
        setTextForm({ ...emptyCommonForm(defaultChatbotId), title: prefill && type === "text" ? prefill : "", content: prefill && type === "text" ? `Q: ${prefill}\nA: ` : "" });
        setWebsiteForm(emptyWebsiteForm(defaultChatbotId));
        if (prefill && type === "text") setSelectedType("text");
      } catch (e) {
        if (mounted) setError(getErrorMessage(e));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [searchParams]);

  useEffect(() => {
    const activeChatbotId = selectedType === "file" ? fileForm.chatbotId : selectedType === "text" ? textForm.chatbotId : websiteForm.chatbotId;
    const chatbot = chatbots.find(c => c.id === activeChatbotId);
    if (chatbot) writeSelectedAdminChatbot({ id: chatbot.id, name: chatbot.name });
  }, [chatbots, fileForm.chatbotId, selectedType, textForm.chatbotId, websiteForm.chatbotId]);

  useEffect(() => {
    if (!result?.id) return;
    let cancelled = false;
    let timer: number | undefined;
    const terminal = new Set(["completed", "ready", "failed", "inactive"]);
    const refresh = async () => {
      try {
        const detail = await getKnowledgeDetail(result.id);
        if (cancelled) return;
        setTrackedResult(detail);
        const s = detail.ingestionStatus || detail.displayStatus || detail.status;
        if (s === "failed") setSubmitStatus("학습 처리에 실패했습니다. 목록 화면에서 진단 정보를 확인하세요.");
        else if (terminal.has(s)) setSubmitStatus("등록과 학습 처리가 완료되었습니다.");
        else setSubmitStatus("등록 요청이 완료되었습니다. 학습 상태를 확인 중입니다.");
        if (terminal.has(s) && timer) window.clearInterval(timer);
      } catch {
        if (!cancelled) setSubmitStatus("등록 결과를 받았습니다. 목록 화면에서 최신 학습 상태를 확인하세요.");
      }
    };
    void refresh();
    timer = window.setInterval(() => { void refresh(); }, 2500);
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [result?.id]);

  const handleFile = (file: File | null) => {
    setSelectedFile(file);
    if (!file?.name.toLowerCase().endsWith(".pdf")) setUseVision(false);
  };

  const submitFile = async () => {
    if (!selectedFile) { setError("업로드할 파일을 선택해주세요."); return; }
    setIsSubmitting(true); setError(null); setResult(null); setTrackedResult(null);
    setSubmitStatus("파일을 업로드하고 텍스트를 추출하는 중입니다.");
    try {
      const response = await uploadKnowledgeFile({ chatbotId: fileForm.chatbotId, file: selectedFile, title: fileForm.title, category: fileForm.category || undefined, field: fileForm.field || undefined, tags: parseTags(fileForm.tags), memo: fileForm.memo || undefined, effectiveDate: fileForm.effectiveDate || undefined, department: fileForm.department || undefined, use_vision: useVision });
      setResult(response); setTrackedResult(response);
      setSubmitStatus("파일 등록 요청이 완료되었습니다. 학습 상태를 확인 중입니다.");
      setSelectedFile(null); setUseVision(false);
    } catch (e) { setError(getErrorMessage(e)); setSubmitStatus(null); } finally { setIsSubmitting(false); }
  };

  const submitText = async () => {
    setIsSubmitting(true); setError(null); setResult(null); setTrackedResult(null);
    setSubmitStatus("텍스트 지식을 등록하고 학습하는 중입니다.");
    try {
      const response = await createKnowledgeText({ chatbotId: textForm.chatbotId, title: textForm.title, content: textForm.content, category: textForm.category || undefined, field: textForm.field || undefined, tags: parseTags(textForm.tags), memo: textForm.memo || undefined, effectiveDate: textForm.effectiveDate || undefined, department: textForm.department || undefined });
      setResult(response); setTrackedResult(response);
      setSubmitStatus("텍스트 등록 요청이 완료되었습니다. 학습 상태를 확인 중입니다.");
    } catch (e) { setError(getErrorMessage(e)); setSubmitStatus(null); } finally { setIsSubmitting(false); }
  };

  const submitWebsite = async () => {
    setIsSubmitting(true); setError(null); setResult(null); setTrackedResult(null);
    setSubmitStatus("웹사이트 등록 요청을 보내는 중입니다.");
    try {
      const response = await createKnowledgeWebsite({ chatbotId: websiteForm.chatbotId, url: websiteForm.url, title: websiteForm.title, crawlPageLimit: Number(websiteForm.crawlPageLimit) || 300, crawlAllPages: websiteForm.crawlAllPages, includeAttachments: websiteForm.includeAttachments, excludedPaths: parseExcludedPaths(websiteForm.excludedPaths), category: websiteForm.category || undefined, field: websiteForm.field || undefined, tags: parseTags(websiteForm.tags), memo: websiteForm.memo || undefined, department: websiteForm.department || undefined });
      setResult(response); setTrackedResult(response);
      setSubmitStatus("웹사이트 수집 요청이 등록되었습니다. 학습 상태를 확인 중입니다.");
    } catch (e) { setError(getErrorMessage(e)); setSubmitStatus(null); } finally { setIsSubmitting(false); }
  };

  const visibleResult = trackedResult ?? result;
  const visibleStatus = visibleResult?.ingestionStatus || visibleResult?.displayStatus || visibleResult?.status;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* OCR 상태 배너 */}
      {runtimeStatus && !runtimeStatus.scannedPdfReady && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#92400e" }}>
          스캔 PDF OCR 환경이 준비되지 않았습니다. 이미지형 PDF는 텍스트 추출이 제한될 수 있습니다.
        </div>
      )}

      {/* 타입 선택 카드 */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>등록 방식 선택</h2>
        <div className="grid grid-cols-3 gap-4">
          {(["file", "text", "website"] as RegisterType[]).map(t => (
            <TypeCard key={t} type={t} selected={selectedType === t} onClick={() => setSelectedType(t)} />
          ))}
        </div>
      </div>

      {/* 폼 영역 */}
      {!isLoading && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-6">
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>
            {selectedType === "file" ? "파일 업로드" : selectedType === "text" ? "텍스트 입력" : "웹사이트 등록"}
          </h2>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626" }}>
              {error}
            </div>
          )}
          {submitStatus && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1d4ed8" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isSubmitting && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
                <span>{submitStatus}</span>
              </div>
              {visibleResult && (
                <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12, color: "#1e40af" }}>
                  <span>진행률: {visibleResult.ingestionProgressPercent ?? 0}%</span>
                  <span>청크: {visibleResult.chunkCount ?? 0}</span>
                  <span>임베딩: {visibleResult.embeddingCount ?? 0}</span>
                </div>
              )}
            </div>
          )}

          {/* 파일 업로드 폼 */}
          {selectedType === "file" && (
            <div className="space-y-5">
              {/* 드래그앤드롭 영역 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null); }}
                style={{
                  border: `2px dashed ${dragOver ? "#2563eb" : "#cbd5e1"}`,
                  borderRadius: 12, padding: "40px 24px", textAlign: "center",
                  background: dragOver ? "#eff6ff" : "#f8fafc", cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <Upload style={{ width: 48, height: 48, color: "#94a3b8", margin: "0 auto 12px" }} />
                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{selectedFile.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 14, color: "#334155", fontWeight: 500 }}>파일을 드래그하거나 클릭해서 선택하세요</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>PDF, DOCX, HWP, XLSX, PPTX, TXT (최대 50MB)</div>
                  </>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFile(e.target.files?.[0] ?? null)} />
              </div>

              {/* Vision 체크박스 */}
              {selectedFile?.name.toLowerCase().endsWith(".pdf") && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={useVision} onChange={e => setUseVision(e.target.checked)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>Vision 학습 사용</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>표·이미지가 포함된 PDF나 스캔 문서에 권장합니다. 처리 시간이 길어질 수 있습니다.</div>
                  </div>
                </label>
              )}

              <CommonFields form={fileForm} chatbots={chatbots} onChange={(k, v) => setFileForm(c => ({ ...c, [k]: v }))} />

              <button type="button" onClick={() => void submitFile()} disabled={isSubmitting} className="btn-primary w-full flex items-center justify-center gap-2" style={{ padding: "12px 24px", fontSize: 15 }}>
                {isSubmitting ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />등록 중...</> : <><Save style={{ width: 16, height: 16 }} />등록하기</>}
              </button>
            </div>
          )}

          {/* 텍스트 폼 */}
          {selectedType === "text" && (
            <div className="space-y-5">
              <CommonFields form={textForm} chatbots={chatbots} onChange={(k, v) => setTextForm(c => ({ ...c, [k]: v }))} />
              <label>
                <Label required>본문</Label>
                <textarea value={textForm.content} onChange={e => setTextForm(c => ({ ...c, content: e.target.value }))} rows={10} className="input-field" style={{ minHeight: 200 }} placeholder={"Q: 질문을 입력하세요\nA: 답변을 입력하세요"} />
              </label>
              <button type="button" onClick={() => void submitText()} disabled={isSubmitting} className="btn-primary w-full flex items-center justify-center gap-2" style={{ padding: "12px 24px", fontSize: 15 }}>
                {isSubmitting ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />등록 중...</> : <><Save style={{ width: 16, height: 16 }} />등록하기</>}
              </button>
            </div>
          )}

          {/* 웹사이트 폼 */}
          {selectedType === "website" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label>
                  <Label required>챗봇 선택</Label>
                  <select value={websiteForm.chatbotId} onChange={e => setWebsiteForm(c => ({ ...c, chatbotId: e.target.value }))} className="input-field">
                    <option value="">챗봇 선택</option>
                    {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  <Label required>URL</Label>
                  <div style={{ position: "relative" }}>
                    <Globe style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94a3b8" }} />
                    <input value={websiteForm.url} onChange={e => setWebsiteForm(c => ({ ...c, url: e.target.value }))} className="input-field" style={{ paddingLeft: 32 }} placeholder="https://" />
                  </div>
                </label>
                <label>
                  <Label required>제목</Label>
                  <input value={websiteForm.title} onChange={e => setWebsiteForm(c => ({ ...c, title: e.target.value }))} className="input-field" />
                </label>
                <label>
                  <Label>크롤링 페이지 수</Label>
                  <input type="number" min={1} max={1000} value={websiteForm.crawlPageLimit} onChange={e => setWebsiteForm(c => ({ ...c, crawlPageLimit: e.target.value }))} className="input-field" />
                </label>
                <label className="flex items-center gap-3 cursor-pointer" style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", background: "#f8fafc" }}>
                  <input type="checkbox" checked={websiteForm.crawlAllPages} onChange={e => setWebsiteForm(c => ({ ...c, crawlAllPages: e.target.checked }))} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>하위 페이지 전체 수집</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", background: "#f8fafc" }}>
                  <input type="checkbox" checked={websiteForm.includeAttachments} onChange={e => setWebsiteForm(c => ({ ...c, includeAttachments: e.target.checked }))} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>첨부파일도 색인</span>
                </label>
                <label>
                  <Label>카테고리</Label>
                  <input value={websiteForm.category} onChange={e => setWebsiteForm(c => ({ ...c, category: e.target.value }))} className="input-field" />
                </label>
                <label>
                  <Label>분야</Label>
                  <input value={websiteForm.field} onChange={e => setWebsiteForm(c => ({ ...c, field: e.target.value }))} className="input-field" />
                </label>
                <label>
                  <Label>담당 부서</Label>
                  <input value={websiteForm.department} onChange={e => setWebsiteForm(c => ({ ...c, department: e.target.value }))} className="input-field" />
                </label>
                <label>
                  <Label>태그</Label>
                  <input value={websiteForm.tags} onChange={e => setWebsiteForm(c => ({ ...c, tags: e.target.value }))} className="input-field" placeholder="쉼표로 구분" />
                </label>
                <label className="md:col-span-2">
                  <Label>제외 경로</Label>
                  <textarea value={websiteForm.excludedPaths} onChange={e => setWebsiteForm(c => ({ ...c, excludedPaths: e.target.value }))} rows={3} className="input-field" placeholder={"/login\n/board/history"} />
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>줄바꿈 또는 쉼표로 여러 경로를 입력할 수 있습니다.</p>
                </label>
                <label className="md:col-span-2">
                  <Label>메모</Label>
                  <textarea value={websiteForm.memo} onChange={e => setWebsiteForm(c => ({ ...c, memo: e.target.value }))} rows={3} className="input-field" />
                </label>
              </div>
              <button type="button" onClick={() => void submitWebsite()} disabled={isSubmitting} className="btn-primary w-full flex items-center justify-center gap-2" style={{ padding: "12px 24px", fontSize: 15 }}>
                {isSubmitting ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />등록 중...</> : <><Save style={{ width: 16, height: 16 }} />등록하기</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 등록 결과 */}
      {visibleResult && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <strong style={{ fontSize: 15, color: "#1e293b" }}>{visibleResult.title}</strong>
            <span className={statusBadgeClass(visibleStatus || visibleResult.status)}>{statusLabel(visibleStatus || visibleResult.status)}</span>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{visibleResult.summary ?? "등록이 완료되었습니다."}</p>
          <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 16 }}>
            {[["진행률", `${visibleResult.ingestionProgressPercent ?? 0}%`], ["텍스트", `${visibleResult.extractedTextLength ?? 0}자`], ["청크", `${visibleResult.chunkCount ?? 0}`], ["임베딩", `${visibleResult.embeddingCount ?? 0}`]].map(([label, val]) => (
              <div key={label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/admin/knowledge/list" className="btn-primary" style={{ fontSize: 13 }}>목록에서 확인</Link>
            <button type="button" onClick={() => { setResult(null); setTrackedResult(null); setSubmitStatus(null); }} className="btn-secondary" style={{ fontSize: 13 }}>계속 등록</button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, Plus, Loader2 } from "lucide-react";

import { ApiClientError } from "../../lib/api";
import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";
import {
  createKnowledgeWebsite,
  createKnowledgeTextToStaging,
  getAdminChatbots,
  previewApiKnowledgeSource,
  uploadKnowledgeFileToStaging,
} from "../../lib/api/admin-operations";
import type { AdminChatbotItem, KnowledgeApiPreviewItem } from "../../lib/api/admin-operations-types";

type RegisterType = "file" | "text" | "website" | "api";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "WEBSITE_ALREADY_REGISTERED") return "이미 등록된 웹사이트입니다.";
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "지식 등록에 실패했습니다.";
}

// ── SVG 아이콘 ─────────────────────────────────────────────────────────────────

function UploadSvg() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 28V16M22 16L17 21M22 16L27 21" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 30C9.79 30 8 28.21 8 26c0-1.93 1.4-3.54 3.24-3.9A9 9 0 0 1 22 12a9 9 0 0 1 8.76 7.5A5 5 0 0 1 36 24c0 3.31-2.69 6-8 6H12Z" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PasteSvg() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="15" y="10" width="18" height="24" rx="2" stroke="#9ca3af" strokeWidth="2" />
      <path d="M19 17h6M19 21h5M19 25h7" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WebsiteSvg() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="8" y="12" width="24" height="18" rx="3" stroke="#9ca3af" strokeWidth="2" />
      <path d="M8 19h24M14 12v4M26 12v4" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="6" fill="#fff" stroke="#9ca3af" strokeWidth="1.5" />
      <path d="M32 29v3l2 1.5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── 모달 래퍼 ─────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, subtitle, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
        padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,.18)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

// ── 모달 하단 버튼 ─────────────────────────────────────────────────────────────

function ModalButtons({ onCancel, onConfirm, disabled, isLoading }: {
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <button type="button" onClick={onCancel} style={{
        flex: 1, padding: "12px 0", border: "1px solid #d1d5db", borderRadius: 10,
        background: "#fff", fontSize: 14, fontWeight: 500, color: "#374151", cursor: "pointer",
      }}>취소</button>
      <button type="button" onClick={onConfirm} disabled={disabled || isLoading} style={{
        flex: 1, padding: "12px 0", border: "none", borderRadius: 10,
        background: (disabled || isLoading) ? "#9ca3af" : "#111827",
        fontSize: 14, fontWeight: 600, color: "#fff",
        cursor: (disabled || isLoading) ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {isLoading ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />처리 중...</> : "완료"}
      </button>
    </div>
  );
}

// ── 파일 업로드 모달 ──────────────────────────────────────────────────────────

function FileModal({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (file: File, skipAi: boolean) => void;
  isSubmitting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [skipAi, setSkipAi] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => { if (open) { setFile(null); setSkipAi(false); setLocalError(null); } }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="파일 업로드" subtitle="문서 파일을 업로드하면 AI 답변 생성에 활용합니다.">
      {localError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{localError}</div>
      )}

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files[0] ?? null); }}
        style={{
          border: `2px dashed ${dragOver ? "#2563eb" : "#e5e7eb"}`,
          borderRadius: 12, padding: "60px 24px", textAlign: "center",
          background: dragOver ? "#eff6ff" : "#f9fafb", cursor: "pointer",
          marginBottom: 20, transition: "all 0.15s",
        }}
      >
        {file ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{file.name}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
          </>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto 14px", display: "block" }}>
              <path d="M20 26V14M20 14L15 19M20 14L25 19" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 28C7.79 28 6 26.21 6 24c0-1.93 1.4-3.54 3.24-3.9A8 8 0 0 1 20 10a8 8 0 0 1 7.9 6.7A4.5 4.5 0 0 1 34 21c0 3.87-2.13 7-8 7H10Z" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>파일을 드래그하거나 클릭하세요</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>PDF, Excel, HWP, PPT, Docs 파일 지원</div>
          </>
        )}
        <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 24, fontSize: 13, color: "#374151" }}>
        <input type="checkbox" checked={skipAi} onChange={e => setSkipAi(e.target.checked)} />
        * AI 교정을 건너뜁니다.
      </label>

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => { if (!file) { setLocalError("파일을 선택해주세요."); return; } onSubmit(file, skipAi); }}
        disabled={!file}
        isLoading={isSubmitting}
      />
    </Modal>
  );
}

// ── 텍스트 붙여넣기 모달 ──────────────────────────────────────────────────────

function TextModal({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (content: string, skipAi: boolean) => void;
  isSubmitting: boolean;
}) {
  const [content, setContent] = useState("");
  const [skipAi, setSkipAi] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => { if (open) { setContent(""); setSkipAi(false); setLocalError(null); } }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="텍스트 붙여넣기" subtitle="텍스트를 직접 입력해 AI 답변에 사용할 지식을 등록하세요.">
      {localError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{localError}</div>
      )}

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="여기에 텍스트를 붙여넣으세요."
        style={{
          width: "100%", height: 180, padding: 16, boxSizing: "border-box",
          border: "2px dashed #e5e7eb", borderRadius: 12,
          background: "#f9fafb", resize: "vertical",
          fontSize: 13, color: "#374151", outline: "none",
          marginBottom: 16, fontFamily: "inherit", lineHeight: 1.7,
        }}
      />

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16, fontSize: 13, color: "#374151" }}>
        <input type="checkbox" checked={skipAi} onChange={e => setSkipAi(e.target.checked)} />
        * AI 교정을 건너뜁니다.
      </label>

      <div style={{ marginBottom: 24, fontSize: 12, color: "#6b7280", lineHeight: 2 }}>
        <div>・ 제목과 본문은 줄바꿈으로 구분해 주세요.</div>
        <div>・ 불필요한 UI 요소나 광고 문구는 제거된 뒤 등록해 주세요.</div>
        <div>・ 목록은 -, ·, 번호 등을 사용하면 이해도가 높아집니다.</div>
        <div>・ 한 번에 너무 많은 내용을 붙여넣기보다는 주제별로 나누어 등록하는 것을 권장합니다.</div>
      </div>

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => { if (!content.trim()) { setLocalError("내용을 입력해주세요."); return; } onSubmit(content, skipAi); }}
        disabled={!content.trim()}
        isLoading={isSubmitting}
      />
    </Modal>
  );
}

// ── 웹사이트 연결 모달 ────────────────────────────────────────────────────────

function WebsiteModal({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (urls: string[]) => void;
  isSubmitting: boolean;
}) {
  const [urls, setUrls] = useState(["", "", ""]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => { if (open) { setUrls(["", "", ""]); setLocalError(null); } }, [open]);

  const updateUrl = (i: number, val: string) => setUrls(prev => prev.map((u, j) => j === i ? val : u));

  return (
    <Modal open={open} onClose={onClose} title="웹사이트 연결" subtitle="웹사이트 URL을 연결해 AI 답변에 활용할 정보를 가져옵니다.">
      {localError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{localError}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {urls.map((url, i) => (
          <input
            key={i}
            value={url}
            onChange={e => updateUrl(i, e.target.value)}
            placeholder="지식으로 등록할 웹사이트의 URL을 입력해주세요."
            style={{
              width: "100%", padding: "12px 14px", boxSizing: "border-box",
              border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13,
              color: "#374151", background: "#f9fafb", outline: "none",
            }}
          />
        ))}
      </div>

      <button type="button" onClick={() => setUrls(prev => [...prev, ""])}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280", marginBottom: 20, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
        <Plus style={{ width: 14, height: 14 }} /> 추가 입력
      </button>

      <div style={{ marginBottom: 24, fontSize: 12, color: "#6b7280", lineHeight: 2 }}>
        <div>・ 공개된 텍스트 콘텐츠만 수집됩니다 (이미지, 동영상 제외)</div>
        <div>・ 페이지 제목은 AI가 자동 추출하며, 직접 수정 가능합니다.</div>
        <div>・ 로그인이 필요한 페이지 및 개별 게시물은 수집할 수 없습니다.</div>
      </div>

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => {
          const valid = urls.filter(u => u.trim());
          if (valid.length === 0) { setLocalError("URL을 1개 이상 입력해주세요."); return; }
          onSubmit(valid);
        }}
        isLoading={isSubmitting}
      />
    </Modal>
  );
}

// ── API 연동 모달 ─────────────────────────────────────────────────────────────

function ApiSourceModal({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { url: string; title: string; apiConfig: Record<string, unknown> }) => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [itemsPath, setItemsPath] = useState("");
  const [titleField, setTitleField] = useState("");
  const [contentFields, setContentFields] = useState("");
  const [urlField, setUrlField] = useState("");
  const [paramsText, setParamsText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KnowledgeApiPreviewItem[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(""); setUrl(""); setItemsPath(""); setTitleField(""); setContentFields("");
      setUrlField(""); setParamsText(""); setLocalError(null); setPreview(null);
    }
  }, [open]);

  const buildConfig = (): Record<string, unknown> => {
    const params: Record<string, string> = {};
    paramsText.split("\n").map(l => l.trim()).filter(Boolean).forEach(line => {
      const idx = line.indexOf("=");
      if (idx > 0) params[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return {
      itemsPath: itemsPath.trim(),
      titleField: titleField.trim(),
      contentFields: contentFields.split(",").map(s => s.trim()).filter(Boolean),
      urlField: urlField.trim(),
      params,
    };
  };

  const doPreview = async () => {
    if (!url.trim()) { setLocalError("엔드포인트 URL을 입력해주세요."); return; }
    setPreviewing(true); setLocalError(null); setPreview(null);
    try {
      const res = await previewApiKnowledgeSource({ url: url.trim(), apiConfig: buildConfig() });
      setPreview(res.items);
      if (res.items.length === 0) setLocalError("항목을 찾지 못했습니다. 항목 경로·필드를 확인하세요.");
    } catch (e) {
      setLocalError(e instanceof ApiClientError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : "테스트 호출 실패"));
    } finally { setPreviewing(false); }
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 };

  return (
    <Modal open={open} onClose={onClose} title="API 연동 지식" subtitle="공식 OpenAPI(JSON)를 항목 단위로 수집해 지식으로 색인합니다. 예: 국가법령정보센터.">
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
        <div><label style={labelStyle}>이름</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 국가법령정보 - 지방세" style={inputStyle} /></div>
        <div><label style={labelStyle}>엔드포인트 URL</label><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://apis.data.go.kr/.../service" style={inputStyle} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>항목 경로 (itemsPath)</label><input value={itemsPath} onChange={e => setItemsPath(e.target.value)} placeholder="response.body.items.item" style={inputStyle} /></div>
          <div><label style={labelStyle}>제목 필드</label><input value={titleField} onChange={e => setTitleField(e.target.value)} placeholder="법령명" style={inputStyle} /></div>
          <div><label style={labelStyle}>본문 필드(쉼표로 여러 개)</label><input value={contentFields} onChange={e => setContentFields(e.target.value)} placeholder="조문내용" style={inputStyle} /></div>
          <div><label style={labelStyle}>원문 링크 필드(선택)</label><input value={urlField} onChange={e => setUrlField(e.target.value)} placeholder="상세링크" style={inputStyle} /></div>
        </div>
        <div><label style={labelStyle}>쿼리 파라미터 (한 줄에 key=value)</label>
          <textarea value={paramsText} onChange={e => setParamsText(e.target.value)} rows={3} placeholder={"serviceKey=발급키\ntype=JSON\nnumOfRows=100"} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", lineHeight: 1.6 }} /></div>
      </div>

      <button type="button" onClick={() => void doPreview()} disabled={previewing} style={{ padding: "8px 16px", marginBottom: 14, border: "1px solid #2563eb", borderRadius: 8, background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        {previewing ? "테스트 중..." : "테스트 호출 (미리보기)"}
      </button>

      {preview && preview.length > 0 && (
        <div style={{ marginBottom: 14, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "#f8fafc", fontSize: 12, fontWeight: 600, color: "#475569" }}>미리보기 {preview.length}건</div>
          {preview.map((it, i) => (
            <div key={i} style={{ padding: "8px 12px", borderTop: "1px solid #f1f5f9", fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: "#111827" }}>{it.title}</div>
              <div style={{ color: "#64748b", marginTop: 2, whiteSpace: "pre-wrap" }}>{it.contentPreview}</div>
            </div>
          ))}
        </div>
      )}

      {localError && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>{localError}</p>}

      <ModalButtons
        onCancel={onClose}
        isLoading={isSubmitting}
        onConfirm={() => {
          if (!title.trim() || !url.trim()) { setLocalError("이름과 엔드포인트 URL은 필수입니다."); return; }
          onSubmit({ url: url.trim(), title: title.trim(), apiConfig: buildConfig() });
        }}
      />
    </Modal>
  );
}

// ── 타입 카드 ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<RegisterType, { icon: React.ReactNode; title: string; desc: string; isNew?: boolean }> = {
  file:    { icon: <UploadSvg />, title: "파일 업로드",      desc: "문서 파일을 업로드하면\nAI 답변 생성에 활용합니다." },
  text:    { icon: <PasteSvg />, title: "텍스트 붙여넣기",   desc: "텍스트를 직접 입력해\nAI 답변에 사용할 지식을 등록하세요." },
  website: { icon: <WebsiteSvg />, title: "웹사이트 연결",   desc: "웹사이트 URL을 연결해\nAI 답변에 활용할 정보를 가져옵니다.", isNew: true },
  api:     { icon: <WebsiteSvg />, title: "API 연동 (법령 등)", desc: "공식 OpenAPI(국가법령정보 등)를\n주기적으로 수집해 자동 현행화합니다.", isNew: true },
};

function TypeCard({ type, onClick }: { type: RegisterType; onClick: () => void }) {
  const meta = TYPE_META[type];
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", background: "#fff",
        border: `1.5px solid ${hovered ? "#2563eb" : "#e5e7eb"}`,
        borderRadius: 16, padding: "40px 24px", cursor: "pointer", textAlign: "center",
        boxShadow: hovered ? "0 0 0 3px rgba(37,99,235,0.1)" : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
    >
      {meta.isNew && (
        <span style={{ position: "absolute", top: 14, right: 14, fontSize: 10, fontWeight: 700, background: "#2563eb", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>NEW</span>
      )}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>{meta.icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>{meta.title}</div>
      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, whiteSpace: "pre-line" }}>{meta.desc}</div>
    </button>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function KnowledgeRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [modal, setModal] = useState<RegisterType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminChatbots();
        setChatbots(res.items);
        const defaultId = res.items[0]?.id ?? "";
        setChatbotId(defaultId);
        if (res.items[0]) writeSelectedAdminChatbot({ id: res.items[0].id, name: res.items[0].name });
        if (searchParams.get("type") === "text") setModal("text");
      } catch (e) { setError(getErrorMessage(e)); }
      finally { setIsLoading(false); }
    })();
  }, [searchParams]);

  const handleChatbotChange = (id: string) => {
    setChatbotId(id);
    const chatbot = chatbots.find(c => c.id === id);
    if (chatbot) writeSelectedAdminChatbot({ id: chatbot.id, name: chatbot.name });
  };

  const handleFileSubmit = async (file: File) => {
    if (!chatbotId) { setError("챗봇을 선택해주세요."); return; }
    setIsSubmitting(true); setError(null);
    try {
      const session = await uploadKnowledgeFileToStaging({ chatbotId, file });
      setModal(null);
      router.push(`/admin/knowledge/review?session=${session.sessionId}`);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setIsSubmitting(false); }
  };

  const handleTextSubmit = async (content: string) => {
    if (!chatbotId) { setError("챗봇을 선택해주세요."); return; }
    setIsSubmitting(true); setError(null);
    try {
      const session = await createKnowledgeTextToStaging({ chatbotId, title: "직접입력_텍스트", content });
      setModal(null);
      router.push(`/admin/knowledge/review?session=${session.sessionId}`);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setIsSubmitting(false); }
  };

  const handleWebsiteSubmit = async (urls: string[]) => {
    if (!chatbotId) { setError("챗봇을 선택해주세요."); return; }
    setIsSubmitting(true); setError(null);
    try {
      for (const url of urls) {
        let title = url;
        try { title = new URL(url).hostname; } catch { /* fallback to url */ }
        await createKnowledgeWebsite({
          chatbotId, url, title,
          crawlPageLimit: 300, crawlAllPages: true,
          includeAttachments: true, excludedPaths: [], tags: [],
        });
      }
      setModal(null);
      router.push("/admin/knowledge/list");
    } catch (e) {
      if (!(e instanceof ApiClientError && e.code === "WEBSITE_ALREADY_REGISTERED")) {
        setError(getErrorMessage(e));
      } else {
        setModal(null);
        router.push("/admin/knowledge/list");
      }
    } finally { setIsSubmitting(false); }
  };

  const handleApiSubmit = async (v: { url: string; title: string; apiConfig: Record<string, unknown> }) => {
    if (!chatbotId) { setError("챗봇을 선택해주세요."); return; }
    setIsSubmitting(true); setError(null);
    try {
      await createKnowledgeWebsite({
        chatbotId, url: v.url, title: v.title,
        crawlPageLimit: 1, crawlAllPages: false, includeAttachments: false,
        excludedPaths: [], tags: [],
        sourceKind: "api", apiConfig: v.apiConfig,
      });
      setModal(null);
      router.push("/admin/knowledge/list");
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "WEBSITE_ALREADY_REGISTERED") {
        setModal(null); router.push("/admin/knowledge/list");
      } else { setError(getErrorMessage(e)); }
    } finally { setIsSubmitting(false); }
  };

  if (isLoading) return null;

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>
      )}

      {/* 챗봇 선택 (복수인 경우) */}
      {chatbots.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <select value={chatbotId} onChange={e => handleChatbotChange(e.target.value)} className="input-field" style={{ width: 220 }}>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* 타입 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <TypeCard type="file" onClick={() => setModal("file")} />
        <TypeCard type="text" onClick={() => setModal("text")} />
        <TypeCard type="website" onClick={() => setModal("website")} />
        <TypeCard type="api" onClick={() => setModal("api")} />
      </div>

      {/* 모달 */}
      <FileModal
        open={modal === "file"}
        onClose={() => { if (!isSubmitting) setModal(null); }}
        onSubmit={handleFileSubmit}
        isSubmitting={isSubmitting}
      />
      <TextModal
        open={modal === "text"}
        onClose={() => { if (!isSubmitting) setModal(null); }}
        onSubmit={handleTextSubmit}
        isSubmitting={isSubmitting}
      />
      <WebsiteModal
        open={modal === "website"}
        onClose={() => { if (!isSubmitting) setModal(null); }}
        onSubmit={handleWebsiteSubmit}
        isSubmitting={isSubmitting}
      />
      <ApiSourceModal
        open={modal === "api"}
        onClose={() => { if (!isSubmitting) setModal(null); }}
        onSubmit={handleApiSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

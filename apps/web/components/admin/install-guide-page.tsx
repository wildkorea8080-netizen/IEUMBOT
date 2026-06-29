"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";

import { ApiClientError } from "../../lib/api";
import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";
import { getAdminInstallGuide } from "../../lib/api/install-guide";
import { getKnowledgeList } from "../../lib/api/admin-operations";
import type { AdminInstallGuideItem } from "../../lib/api/install-guide-types";

// ── 공유 링크 로컬 스토리지 ───────────────────────────────────────────────────

type ShareLink = { id: string; label: string; isActive: boolean };

const LINKS_KEY = (id: string) => `ieumbot_links_${id}`;

function loadLinks(chatbotId: string): ShareLink[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LINKS_KEY(chatbotId)) ?? "[]") as ShareLink[]; }
  catch { return []; }
}
function saveLinks(chatbotId: string, links: ShareLink[]) {
  localStorage.setItem(LINKS_KEY(chatbotId), JSON.stringify(links));
}
function chatUrl(chatbotId: string, label: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/chat/${chatbotId}?name=${encodeURIComponent(label)}`;
}

// ── 섹션 카드 래퍼 ───────────────────────────────────────────────────────────

function Section({ title, description, action, children }: {
  title: string; description: string; action?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: children ? 20 : 0 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{title}</h2>
          <p style={{ fontSize: 13, color: "#6b7280" }}>{description}</p>
        </div>
        {action && <div style={{ flexShrink: 0, marginLeft: 20 }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── 설정 상태 행 ─────────────────────────────────────────────────────────────

function StatusRow({ label, text, ok }: { label: string; text: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 140 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? "#22c55e" : "#9ca3af", flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, color: "#6b7280" }}>{text}</span>
    </div>
  );
}

// ── 토글 스위치 ──────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 11,
      background: value ? "#2563eb" : "#e5e7eb",
      position: "relative", cursor: "pointer", transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 0.2s",
      }} />
    </div>
  );
}

// ── 복사 버튼 ────────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
      {copied ? <Check style={{ width: 13, height: 13, color: "#16a34a" }} /> : <Copy style={{ width: 13, height: 13 }} />}
      {copied ? "복사됨" : label}
    </button>
  );
}

// ── 메인 ────────────────────────────────────────────────────────────────────

function getErrorMessage(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "오류가 발생했습니다.";
}

export function InstallGuidePage() {
  const [items, setItems] = useState<AdminInstallGuideItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);

  // 공유 링크 상태
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [editLabels, setEditLabels] = useState<Record<string, string>>({});

  const selected = useMemo(() => items.find(i => i.chatbotId === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminInstallGuide();
        setItems(res.items);
        const pref = res.items.find(i => i.hasWidget) ?? res.items[0];
        if (pref) { setSelectedId(pref.chatbotId); writeSelectedAdminChatbot({ id: pref.chatbotId, name: pref.chatbotName }); }
      } catch (e) { setError(getErrorMessage(e)); }
      finally { setIsLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setShareLinks(loadLinks(selectedId));
    void (async () => {
      try {
        const [file, web] = await Promise.all([
          getKnowledgeList({ sourceGroup: "file_text" }),
          getKnowledgeList({ sourceGroup: "website" }),
        ]);
        setKnowledgeCount(file.items.length + web.items.length);
      } catch { setKnowledgeCount(null); }
    })();
  }, [selectedId]);

  function addLink() {
    if (!newLabel.trim() || !selectedId) return;
    const link: ShareLink = { id: `link_${Date.now()}`, label: newLabel.trim(), isActive: true };
    const next = [...shareLinks, link];
    setShareLinks(next);
    saveLinks(selectedId, next);
    setNewLabel(""); setAddingLink(false);
  }

  function toggleLink(id: string) {
    const next = shareLinks.map(l => l.id === id ? { ...l, isActive: !l.isActive } : l);
    setShareLinks(next); saveLinks(selectedId, next);
  }

  function deleteLink(id: string) {
    const next = shareLinks.filter(l => l.id !== id);
    setShareLinks(next); saveLinks(selectedId, next);
  }

  function saveLabel(id: string) {
    const label = (editLabels[id] ?? "").trim();
    if (!label) return;
    const next = shareLinks.map(l => l.id === id ? { ...l, label } : l);
    setShareLinks(next); saveLinks(selectedId, next);
    setEditLabels(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  const [keyVisible, setKeyVisible] = useState(false);

  const installCode = selected?.installScript ??
    `<!-- 이음봇 AI 대화 에이전트 기본 설치 -->\n<script\n  src="/widget.js"\n  data-chatbot-id="${selectedId}"\n  charset="UTF-8"\n></script>`;

  const maskedKey = selectedId
    ? `○ ${selectedId.replace(/[a-f0-9]/gi, "●").slice(0, 32)}`
    : "";

  if (isLoading) return <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>설치 정보를 불러오는 중...</div>;
  if (error) return <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 챗봇 선택 */}
      {items.length > 1 && (
        <div>
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); const c = items.find(i => i.chatbotId === e.target.value); if (c) writeSelectedAdminChatbot({ id: c.chatbotId, name: c.chatbotName }); }}
            className="input-field" style={{ width: 220 }}>
            {items.map(i => <option key={i.chatbotId} value={i.chatbotId}>{i.chatbotName}</option>)}
          </select>
        </div>
      )}

      {/* ── 섹션 1: API 키 ──────────────────────────────────────────────── */}
      <Section
        title="API 키"
        description='도메인에 따라 API키가 새로 발급됩니다. "새로생성"을 통해 발급 후 설치코드를 홈페이지에 넣어주세요.'
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <a href={selected ? `/chat/${selectedId}` : "#"} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", borderRadius: 8, background: "#14b8a6", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "none" }}>
              실제 적용예시 보기
            </a>
            <button type="button" onClick={() => window.location.reload()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
              <RefreshCw style={{ width: 13, height: 13 }} />새로 생성
            </button>
          </div>
        }
      >
        {/* 도메인 입력 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 8 }}>도메인</label>
          <input
            defaultValue={selected?.allowedDomains[0] ?? ""}
            placeholder="배포할 웹사이트 도메인을 입력해주세요."
            style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}
          />
        </div>

        {/* API 키 마스킹 표시 */}
        {selectedId && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb", marginBottom: 16 }}>
            <span style={{ flex: 1, fontSize: 13, color: "#374151", fontFamily: "monospace", letterSpacing: "0.05em" }}>
              {keyVisible ? selectedId : maskedKey}
            </span>
            <button type="button" onClick={() => setKeyVisible(v => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
              {keyVisible ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
            </button>
            <CopyBtn text={selectedId} label="복사" />
          </div>
        )}

        {/* ⚠️ 경고 박스 */}
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>API 키 교체 시 재설치 필수:</p>
              <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7, marginBottom: 10 }}>
                관리자 화면에서 &apos;새로 생성&apos; 버튼을 눌러 API 키를 변경한 경우, 기존 설치 코드는 작동을 멈춥니다.<br />
                반드시 웹사이트에 삽입된 코드를 새로운 키가 포함된 코드로 교체해야 합니다.
              </p>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>도메인 일치 확인:</p>
              <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7, margin: 0 }}>
                API 키 생성 시 입력한 도메인 주소와 실제 코드가 설치된 웹사이트 주소가 일치해야 서비스가 정상 작동합니다.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 섹션 2: 설치 코드 ──────────────────────────────────────────── */}
      <Section
        title="설치 코드"
        description="코드를 복사하여 해당 영역에 붙여넣기하여 적용하세요."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button"
              onClick={() => {
                const text = `설치 안내\n\n1. 아래 코드를 </body> 직전에 삽입하세요.\n   ★ 모든 페이지에 위젯이 보이려면, 페이지마다 넣지 말고 '모든 페이지가 공유하는 공통 푸터/전체 레이아웃' 한 곳에 넣으세요.\n     (CMS의 공통 푸터/전역 스크립트 설정란, 또는 Google Tag Manager의 All Pages 태그 권장)\n2. 허용 도메인에 실제 홈페이지 도메인을 등록하세요.\n3. HTTPS 환경에서 테스트하세요.\n\n${installCode}`;
                const blob = new Blob([text], { type: "text/plain" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "install-guide.txt"; a.click();
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
              <Download style={{ width: 13, height: 13 }} />가이드 다운로드
            </button>
            <CopyBtn text={installCode} label="코드 복사" />
          </div>
        }
      >
        <pre style={{ background: selected?.hasWidget ? "#1e2a3a" : "#9ca3af", borderRadius: 12, padding: "20px 24px", fontSize: 13, color: "#e2e8f0", whiteSpace: "pre-wrap", wordBreak: "break-all", minHeight: 100, fontFamily: "monospace", lineHeight: 1.8, margin: 0 }}>
          {selected?.hasWidget ? installCode : "API 키를 생성해주세요."}
        </pre>
      </Section>

      {/* ── 섹션 2-1: 설치 방법 3단계 ──────────────────────────────────────── */}
      <Section
        title="설치 방법 (3단계)"
        description="아래 순서대로 진행하면 웹사이트에 AI 대화 위젯이 나타납니다."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            {
              num: 1,
              title: "설치 스크립트 복사",
              desc: "API 키를 생성했다면, 위 '설치 코드'에 표시된 스크립트 코드를 복사합니다.\n[코드 복사] 버튼을 클릭하면 클립보드에 자동 저장됩니다.",
            },
            {
              num: 2,
              title: "웹사이트에 코드 붙여넣기 (모든 페이지 공통 영역)",
              desc: "AI 대화 에이전트를 적용할 웹사이트의 </body> 태그 바로 윗줄에 복사한 코드를 붙여넣습니다.\n※ 모든 페이지에 위젯이 보이려면, 페이지마다 넣지 말고 '모든 페이지가 공유하는 공통 푸터/전체 레이아웃' 한 곳에 넣으세요. (아래 안내 참고)",
            },
            {
              num: 3,
              title: "설치 확인",
              desc: "코드 수정 후 파일을 저장하고 서버에 배포합니다.\n웹브라우저에서 해당 페이지를 새로고침(F5)하면 우측 하단에 AI 대화 위젯이 나타나는지 확인합니다.",
            },
          ].map((step, i, arr) => (
            <div key={step.num} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#111827", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                {step.num}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>{step.title}</p>
                <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.75, whiteSpace: "pre-line", margin: 0 }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 📌 핵심 원칙: 공통 영역 1회 = 모든 페이지 */}
        <div style={{ marginTop: 16, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📌</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", marginBottom: 6 }}>핵심 — 모든 페이지에 표시하려면 &lsquo;공통 영역&rsquo;에 한 번만 넣으세요</p>
              <p style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.7, margin: 0 }}>
                위젯은 <strong>코드가 들어간 페이지에만</strong> 나타납니다. 메인에만 넣으면 하위 페이지에서 사라집니다.
                페이지마다 넣지 말고, <strong>모든 페이지가 공유하는 공통 영역(공통 푸터·전체 레이아웃)에 한 번만</strong> 넣으면 전체 페이지에 자동으로 표시됩니다. 구체적 위치는 아래 표를 참고하세요.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 섹션 2-2: 홈페이지 종류별 코드 위치 ──────────────────────────────── */}
      <Section
        title="어디에 코드를 넣나요? (홈페이지 종류별)"
        description="홈페이지를 만든 방식에 따라 '공통 영역'의 위치가 다릅니다. 한 곳에만 넣으면 모든 페이지에 적용됩니다."
      >
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", width: 190 }}>홈페이지 종류</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>코드 넣는 위치 (공통 영역에 1회)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { type: "직접 제작 (HTML)", where: "공통으로 불러오는 푸터 파일(footer.html, footer.php 등)의 </body> 직전 — 한 번 넣으면 전체 페이지 적용" },
                { type: "워드프레스 (WordPress)", where: "테마 편집 → footer.php의 </body> 직전, 또는 'WPCode'·'헤더/푸터 삽입' 플러그인의 Footer 영역" },
                { type: "그누보드·영카트 (국내)", where: "스킨 공통 꼬리말 tail.php(또는 tail.skin.php)의 </body> 직전" },
                { type: "카페24", where: "관리자 → 디자인(스마트디자인) → 공통 레이아웃/푸터의 </body> 직전, 또는 '외부 스크립트 관리'" },
                { type: "아임웹 (imweb)", where: "관리자 → 환경설정 → 코드 삽입 → Body 하단(footer) 영역" },
                { type: "윅스 (Wix)", where: "설정 → 사용자 정의 코드 → 위치 'Body - end' + 적용 범위 '모든 페이지(All pages)'" },
                { type: "정부·공공기관 CMS", where: "'공통 푸터 / 전체 하단 HTML / 전역 스크립트' 설정란에 삽입" },
                { type: "React·Next.js (SPA)", where: "index.html 또는 공통 레이아웃(_app, layout)의 body 하단에 1회" },
                { type: "Google Tag Manager (만능)", where: "'맞춤 HTML' 태그 + 'All Pages(모든 페이지)' 트리거 — 사이트 코드 수정 없이 전체 적용 (가장 쉬움)" },
              ].map((row, i, arr) => (
                <tr key={row.type} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, color: "#111827", verticalAlign: "top" }}>{row.type}</td>
                  <td style={{ padding: "12px 14px", color: "#6b7280", lineHeight: 1.6 }}>{row.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.7, marginTop: 12, marginBottom: 0 }}>
          ※ 어디에 넣을지 모르겠으면 <strong>Google Tag Manager의 All Pages 태그</strong>가 가장 쉽고 안전합니다(사이트 코드 수정 없이 모든 페이지 적용).
          하위 페이지가 별도 시스템·iframe이면 그쪽에도 동일하게 넣어야 합니다.
        </p>
      </Section>

      {/* ── 섹션 3: 공유 링크 만들기 ──────────────────────────────────────── */}
      <Section
        title="공유 링크 만들기"
        description="공유 링크를 생성하여 홈페이지 설치 없이 바로 챗봇과 대화합니다."
        action={
          <button type="button" onClick={() => setAddingLink(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            <Plus style={{ width: 13, height: 13 }} />링크추가
          </button>
        }
      >
        {/* 테이블 */}
        {(shareLinks.length > 0 || addingLink) && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["공유 URL", "설명", "활성", "관리"].map(col => (
                    <th key={col} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shareLinks.map(link => (
                  <tr key={link.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <a href={chatUrl(selectedId, link.label)} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 320 }}>
                        {chatUrl(selectedId, link.label)}
                      </a>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {editLabels[link.id] !== undefined ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={editLabels[link.id]} onChange={e => setEditLabels(p => ({ ...p, [link.id]: e.target.value }))}
                            style={{ flex: 1, padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12 }}
                            onKeyDown={e => { if (e.key === "Enter") saveLabel(link.id); }} />
                          <button type="button" onClick={() => saveLabel(link.id)}
                            style={{ padding: "4px 8px", background: "#111827", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer" }}>저장</button>
                        </div>
                      ) : (
                        <span>{link.label}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Toggle value={link.isActive} onChange={() => toggleLink(link.id)} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button type="button" onClick={() => setEditLabels(p => ({ ...p, [link.id]: link.label }))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}>
                          ✏️
                        </button>
                        <CopyBtn text={chatUrl(selectedId, link.label)} label="복사" />
                        <button type="button" onClick={() => deleteLink(link.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 2 }}>
                          <Trash2 style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 링크 추가 폼 */}
        {addingLink && (
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addLink(); if (e.key === "Escape") setAddingLink(false); }}
              placeholder="링크 설명을 입력하세요 (예: 사업 안내)"
              autoFocus
              style={{ flex: 1, padding: "10px 14px", border: "1px solid #2563eb", borderRadius: 10, fontSize: 13, outline: "none" }}
            />
            <button type="button" onClick={addLink}
              style={{ padding: "10px 18px", border: "none", borderRadius: 10, background: "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              저장하기
            </button>
            <button type="button" onClick={() => { setAddingLink(false); setNewLabel(""); }}
              style={{ padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
              취소
            </button>
          </div>
        )}

        {!addingLink && shareLinks.length === 0 && (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>등록된 공유 링크가 없습니다.</p>
        )}
      </Section>

      {/* ── 섹션 4: 설정 상태 ──────────────────────────────────────────── */}
      <Section
        title="설정 상태"
        description="AI 대화 에이전트 설정 상태를 확인합니다."
      >
        <StatusRow
          label="AI 기본설정"
          ok={selected?.hasWidget ?? false}
          text={selected?.hasWidget ? "AI 기본설정이 완료되었습니다." : "위젯이 아직 설정되지 않았습니다."}
        />
        <StatusRow
          label="대화 스타일 설정"
          ok={selected?.isActive ?? false}
          text={selected?.isActive ? "대화 스타일 설정이 완료되었습니다." : "위젯이 비활성 상태입니다."}
        />
        <StatusRow
          label="지식베이스"
          ok={(knowledgeCount ?? 0) > 0}
          text={knowledgeCount === null ? "불러오는 중..." : knowledgeCount > 0 ? `${knowledgeCount}건의 지식이 등록되었습니다.` : "등록된 지식이 없습니다."}
        />
      </Section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Power, PowerOff, TestTube2 } from "lucide-react";

import { AdminModal } from "../../../components/ui/admin-modal";
import { ApiClientError } from "../../../lib/api";
import { writeSelectedAdminChatbot } from "../../../lib/admin-ui/selected-chatbot";
import { createAdminChatbot, getAdminChatbots, patchAdminChatbot } from "../../../lib/api/admin-operations";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case "CHATBOT_NAME_REQUIRED":      return "챗봇 이름을 입력해 주세요.";
      case "CHATBOT_NAME_CONFLICT":      return "이미 같은 이름의 챗봇이 있습니다.";
      case "CHATBOT_LIMIT_EXCEEDED":     return "생성 가능한 챗봇 수를 초과했습니다.";
      case "BILLING_OVER_LIMIT_BLOCKED": return "계약 한도 초과로 챗봇을 생성할 수 없습니다.";
      default: return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

function statusBadge(status: string) {
  if (status === "active") return "badge-success";
  if (status === "inactive") return "badge-warning";
  return "badge-danger";
}

function statusLabel(status: string) {
  if (status === "active") return "활성";
  if (status === "inactive") return "비활성";
  if (status === "suspended") return "중지";
  return status;
}

export default function AdminChatbotsPage() {
  const [items, setItems] = useState<AdminChatbotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load(preferredId?: string) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminChatbots();
      setItems(res.items);
      const target = preferredId
        ? res.items.find((i) => i.id === preferredId)
        : res.items[0];
      if (target) writeSelectedAdminChatbot({ id: target.id, name: target.name });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function toggleStatus(item: AdminChatbotItem) {
    const next = item.status === "active" ? "inactive" : "active";
    setTogglingId(item.id);
    try {
      await patchAdminChatbot(item.id, { status: next });
      await load(item.id);
      setToast(next === "active" ? "챗봇이 활성화되었습니다." : "챗봇이 비활성화되었습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  async function createChatbot() {
    if (!createForm.name.trim()) { setError("챗봇 이름을 입력해 주세요."); return; }
    setIsCreating(true);
    setError(null);
    try {
      const created = await createAdminChatbot({
        name: createForm.name.trim(),
        descriptionText: createForm.description.trim() || null,
      });
      setIsCreateModalOpen(false);
      setCreateForm({ name: "", description: "" });
      setToast("챗봇이 생성되었습니다. 기본 설정에서 세부 사항을 구성해 주세요.");
      await load(created.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 페이지 헤더 */}
      <div className="mb-2">
        <h1 className="section-title">챗봇 관리</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
          기관에 연결된 챗봇을 생성하고 활성·비활성 상태를 관리합니다.
        </p>
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {toast}
        </div>
      )}

      {/* 오류 배너 */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* 챗봇 목록 카드 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>챗봇 목록</span>
            {!isLoading && (
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>{items.length}개</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setError(null); setIsCreateModalOpen(true); }}
            className="btn-primary"
            style={{ padding: "7px 16px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            챗봇 생성
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>아직 챗봇이 없습니다</p>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>챗봇을 생성하면 지식을 등록하고 사용자 질문에 답변할 수 있습니다.</p>
            <button
              type="button"
              onClick={() => { setError(null); setIsCreateModalOpen(true); }}
              className="btn-primary"
              style={{ padding: "10px 24px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              첫 챗봇 만들기
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="table-header">챗봇 이름</th>
                <th className="table-header" style={{ width: 80 }}>상태</th>
                <th className="table-header" style={{ width: 80, textAlign: "right" }}>문서</th>
                <th className="table-header" style={{ width: 80, textAlign: "right" }}>웹소스</th>
                <th className="table-header" style={{ width: 140 }}>수정일</th>
                <th className="table-header" style={{ width: 80, textAlign: "center" }}>테스트</th>
                <th className="table-header" style={{ width: 100, textAlign: "center" }}>ON / OFF</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td className="table-cell">
                    <div>
                      <span style={{ fontWeight: 600, color: "#1e293b" }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{item.id.slice(0, 8)}…</span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={statusBadge(item.status)}>{statusLabel(item.status)}</span>
                  </td>
                  <td className="table-cell" style={{ textAlign: "right", color: "#475569" }}>{item.documentCount ?? "-"}</td>
                  <td className="table-cell" style={{ textAlign: "right", color: "#475569" }}>{item.websiteCount ?? "-"}</td>
                  <td className="table-cell" style={{ color: "#94a3b8", fontSize: 12 }}>
                    {new Date(item.updatedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="table-cell" style={{ textAlign: "center" }}>
                    <Link
                      href={`/admin/test-chatbot?chatbotId=${encodeURIComponent(item.id)}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", textDecoration: "none", padding: "3px 10px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff" }}
                    >
                      <TestTube2 style={{ width: 12, height: 12 }} />
                      테스트
                    </Link>
                  </td>
                  <td className="table-cell" style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(item)}
                      disabled={togglingId === item.id}
                      title={item.status === "active" ? "비활성화" : "활성화"}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12,
                        padding: "4px 12px", borderRadius: 6, border: "1px solid",
                        cursor: togglingId === item.id ? "not-allowed" : "pointer",
                        opacity: togglingId === item.id ? 0.5 : 1,
                        background: item.status === "active" ? "#fef2f2" : "#f0fdf4",
                        borderColor: item.status === "active" ? "#fecaca" : "#bbf7d0",
                        color: item.status === "active" ? "#dc2626" : "#16a34a",
                      }}
                    >
                      {item.status === "active"
                        ? <><PowerOff style={{ width: 12, height: 12 }} />OFF</>
                        : <><Power style={{ width: 12, height: 12 }} />ON</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 챗봇 생성 후 안내 카드 */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p style={{ fontSize: 13, color: "#475569" }}>
            챗봇 생성 후 <Link href="/admin/ai/basic" style={{ color: "#2563eb", fontWeight: 600 }}>기본 설정</Link>에서 챗봇 이름·환영 메시지를 설정하고,{" "}
            <Link href="/admin/knowledge/register" style={{ color: "#2563eb", fontWeight: 600 }}>지식 등록</Link>에서 문서나 웹사이트를 등록하면 바로 답변이 가능합니다.
          </p>
        </div>
      )}

      {/* 챗봇 생성 모달 */}
      <AdminModal
        open={isCreateModalOpen}
        title="챗봇 생성"
        description="현재 기관에 새 챗봇을 추가합니다."
        onClose={() => { if (isCreating) return; setIsCreateModalOpen(false); setCreateForm({ name: "", description: "" }); setError(null); }}
      >
        <div className="space-y-4">
          {error && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626" }}>
              {error}
            </div>
          )}
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">챗봇 이름 <span style={{ color: "#ef4444" }}>*</span></span>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") void createChatbot(); }}
              placeholder="예: 민원 상담 챗봇"
              className="input-field"
              autoFocus
            />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">설명 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="이 챗봇의 역할이나 대상 사용자를 간략히 설명합니다"
              className="input-field"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setIsCreateModalOpen(false); setCreateForm({ name: "", description: "" }); setError(null); }}
              className="btn-secondary"
              style={{ padding: "8px 16px" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void createChatbot()}
              disabled={isCreating}
              className="btn-primary"
              style={{ padding: "8px 20px", opacity: isCreating ? 0.6 : 1 }}
            >
              {isCreating ? "생성 중..." : "생성"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

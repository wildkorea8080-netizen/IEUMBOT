"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { useSelectedChatbot } from "../../../lib/admin-ui/use-selected-chatbot";
import {
  createMenuNode,
  deleteMenuNode,
  getMenuTree,
  reorderMenuNodes,
  updateMenuNode,
} from "../../../lib/api/quick-actions";
import type { MenuNode } from "../../../lib/api/quick-actions-types";

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    // request()가 서버의 실제 검증 메시지(예: "메뉴는 2단까지만 만들 수 있습니다.")를
    // 파싱하지 못했을 때만 영문 기본 메시지("API request failed ...")가 남는다.
    if (error.message && !error.message.startsWith("API request failed")) {
      return error.message;
    }
    return "요청 처리 중 오류가 발생했습니다.";
  }
  if (error instanceof Error) return error.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function QuickActionsPage() {
  const selected = useSelectedChatbot();
  const chatbotId = selected?.id ?? "";

  const [tree, setTree] = useState<MenuNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [childInputs, setChildInputs] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // 이름 수정 — 한 번에 하나만 편집한다(편집 중인 노드 id + 입력값).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const load = useCallback(async () => {
    if (!chatbotId) {
      setTree([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const items = await getMenuTree(chatbotId);
      setTree(items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [chatbotId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAddCategory() {
    const label = newCategoryLabel.trim();
    if (!label || !chatbotId) return;
    setIsAddingCategory(true);
    setError(null);
    try {
      await createMenuNode({
        chatbotId,
        label,
        actionType: "category",
        sortOrder: tree.length + 1,
      });
      setNewCategoryLabel("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsAddingCategory(false);
    }
  }

  async function handleAddQuestion(category: MenuNode) {
    const label = (childInputs[category.id] ?? "").trim();
    if (!label || !chatbotId) return;
    setBusy(category.id, true);
    setError(null);
    try {
      await createMenuNode({
        chatbotId,
        label,
        actionType: "question",
        parentId: category.id,
        payload: label,
        sortOrder: category.children.length + 1,
      });
      setChildInputs((prev) => ({ ...prev, [category.id]: "" }));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(category.id, false);
    }
  }

  function startEditing(node: MenuNode) {
    setEditingId(node.id);
    setEditingLabel(node.label);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingLabel("");
  }

  /** 이름 저장. 질문 노드는 라벨이 곧 챗봇에 전송되는 문구이므로 payload도 함께 맞춘다. */
  async function handleRename(node: MenuNode, kind: "category" | "question") {
    if (!chatbotId) return;
    const label = editingLabel.trim();
    if (!label || label === node.label) {
      cancelEditing();
      return;
    }
    setBusy(node.id, true);
    setError(null);
    try {
      await updateMenuNode(node.id, {
        chatbotId,
        label,
        ...(kind === "question" ? { payload: label } : {}),
      });
      cancelEditing();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(node.id, false);
    }
  }

  /** 형제 목록 안에서 한 칸 위/아래로 이동. 서버에는 형제 전체의 새 순서를 한 번에 보낸다. */
  async function handleMove(node: MenuNode, siblings: MenuNode[], direction: -1 | 1) {
    if (!chatbotId) return;
    const index = siblings.findIndex((item) => item.id === node.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;

    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusy(node.id, true);
    setError(null);
    try {
      await reorderMenuNodes(
        chatbotId,
        reordered.map((item, i) => ({ id: item.id, sortOrder: i + 1 })),
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(node.id, false);
    }
  }

  async function handleToggleEnabled(node: MenuNode) {
    if (!chatbotId) return;
    setBusy(node.id, true);
    setError(null);
    try {
      await updateMenuNode(node.id, { chatbotId, isEnabled: !node.isEnabled });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(node.id, false);
    }
  }

  async function handleDelete(node: MenuNode, kind: "category" | "question") {
    if (!chatbotId) return;
    const confirmMessage =
      kind === "category"
        ? `"${node.label}" 대분류를 삭제하시겠습니까? 하위 질문도 함께 삭제됩니다.`
        : `"${node.label}" 질문을 삭제하시겠습니까?`;
    if (!confirm(confirmMessage)) return;
    setBusy(node.id, true);
    setError(null);
    try {
      await deleteMenuNode(node.id, chatbotId);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(node.id, false);
    }
  }

  if (!chatbotId) {
    return (
      <div className="space-y-4">
        <PagePanel
          title="탐색 메뉴"
          description="위젯 초기 화면에 노출할 대분류 → 질문 2단 메뉴를 관리합니다."
        >
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            좌측 상단에서 챗봇을 먼저 선택해 주세요.
          </p>
        </PagePanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PagePanel
        title="탐색 메뉴"
        description="위젯 초기 화면에 노출할 대분류 → 질문 2단 메뉴를 관리합니다. 대분류를 만들고 그 아래 질문 버튼을 추가하면, 사용자가 버튼을 눌러 바로 답변을 받을 수 있습니다."
      >
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              fontSize: 13,
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}

        {/* 대분류 추가 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddCategory();
            }}
            placeholder="예: 민원 신청 안내"
            className="input-field"
            style={{ maxWidth: 320 }}
          />
          <button
            type="button"
            onClick={() => void handleAddCategory()}
            disabled={isAddingCategory || !newCategoryLabel.trim()}
            className="btn-primary"
          >
            <Plus style={{ width: 14, height: 14 }} />
            {isAddingCategory ? "추가 중..." : "대분류 추가"}
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
            불러오는 중...
          </div>
        ) : tree.length === 0 ? (
          <div style={{ padding: "24px 16px", background: "#f9fafb", borderRadius: 10, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>등록된 대분류가 없습니다.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tree.map((category, categoryIndex) => (
              <div key={category.id} className="card" style={{ padding: 16 }}>
                {/* 대분류 헤더 */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  {editingId === category.id ? (
                    <>
                      <input
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(category, "category");
                          if (e.key === "Escape") cancelEditing();
                        }}
                        autoFocus
                        className="input-field"
                        style={{ maxWidth: 280, fontWeight: 700 }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(category, "category")}
                        disabled={busyIds.has(category.id) || !editingLabel.trim()}
                        className="btn-primary"
                      >
                        저장
                      </button>
                      <button type="button" onClick={cancelEditing} className="btn-secondary">
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{category.label}</span>
                      {category.children.length === 0 && (
                        <span className="badge-warning">질문 없음 — 위젯에 표시되지 않습니다</span>
                      )}
                      {!category.isEnabled && <span className="badge-neutral">숨김</span>}
                    </>
                  )}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {editingId !== category.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleMove(category, tree, -1)}
                          disabled={busyIds.has(category.id) || categoryIndex === 0}
                          title="위로"
                          className="btn-secondary"
                          style={{ padding: "6px 9px" }}
                        >
                          <ChevronUp style={{ width: 14, height: 14 }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMove(category, tree, 1)}
                          disabled={busyIds.has(category.id) || categoryIndex === tree.length - 1}
                          title="아래로"
                          className="btn-secondary"
                          style={{ padding: "6px 9px" }}
                        >
                          <ChevronDown style={{ width: 14, height: 14 }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(category)}
                          disabled={busyIds.has(category.id)}
                          className="btn-secondary"
                        >
                          <Pencil style={{ width: 13, height: 13 }} />
                          이름 수정
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleToggleEnabled(category)}
                      disabled={busyIds.has(category.id)}
                      className="btn-secondary"
                    >
                      {category.isEnabled ? (
                        <>
                          <EyeOff style={{ width: 13, height: 13 }} />
                          숨기기
                        </>
                      ) : (
                        <>
                          <Eye style={{ width: 13, height: 13 }} />
                          보이기
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(category, "category")}
                      disabled={busyIds.has(category.id)}
                      className="btn-danger"
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                      삭제
                    </button>
                  </div>
                </div>

                {/* 하위 질문 목록 */}
                {category.children.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {category.children.map((question, questionIndex) => (
                      <div
                        key={question.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 12px",
                          background: "#f9fafb",
                          borderRadius: 8,
                        }}
                      >
                        {editingId === question.id ? (
                          <>
                            <input
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleRename(question, "question");
                                if (e.key === "Escape") cancelEditing();
                              }}
                              autoFocus
                              className="input-field"
                              style={{ flex: 1, fontSize: 13 }}
                            />
                            <button
                              type="button"
                              onClick={() => void handleRename(question, "question")}
                              disabled={busyIds.has(question.id) || !editingLabel.trim()}
                              className="btn-primary"
                              style={{ padding: "5px 12px", fontSize: 12 }}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="btn-secondary"
                              style={{ padding: "5px 12px", fontSize: 12 }}
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>{question.label}</span>
                            <button
                              type="button"
                              onClick={() => void handleMove(question, category.children, -1)}
                              disabled={busyIds.has(question.id) || questionIndex === 0}
                              title="위로"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: questionIndex === 0 ? "default" : "pointer",
                                color: questionIndex === 0 ? "#e5e7eb" : "#9ca3af",
                              }}
                            >
                              <ChevronUp style={{ width: 15, height: 15 }} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMove(question, category.children, 1)}
                              disabled={
                                busyIds.has(question.id) ||
                                questionIndex === category.children.length - 1
                              }
                              title="아래로"
                              style={{
                                background: "none",
                                border: "none",
                                cursor:
                                  questionIndex === category.children.length - 1
                                    ? "default"
                                    : "pointer",
                                color:
                                  questionIndex === category.children.length - 1
                                    ? "#e5e7eb"
                                    : "#9ca3af",
                              }}
                            >
                              <ChevronDown style={{ width: 15, height: 15 }} />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditing(question)}
                              disabled={busyIds.has(question.id)}
                              title="이름 수정"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
                            >
                              <Pencil style={{ width: 14, height: 14 }} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(question, "question")}
                              disabled={busyIds.has(question.id)}
                              title="질문 삭제"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db" }}
                            >
                              <Trash2 style={{ width: 14, height: 14 }} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 질문 추가 */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={childInputs[category.id] ?? ""}
                    onChange={(e) =>
                      setChildInputs((prev) => ({ ...prev, [category.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddQuestion(category);
                    }}
                    placeholder="예: 신청 방법이 궁금해요"
                    className="input-field"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddQuestion(category)}
                    disabled={busyIds.has(category.id) || !(childInputs[category.id] ?? "").trim()}
                    className="btn-secondary"
                  >
                    <Plus style={{ width: 13, height: 13 }} />
                    질문 추가
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PagePanel>
    </div>
  );
}

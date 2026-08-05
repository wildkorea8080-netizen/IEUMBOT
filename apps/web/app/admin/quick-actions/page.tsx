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
import type { MenuActionType, MenuNode } from "../../../lib/api/quick-actions-types";

/** 서버(quick_action_service.MAX_MENU_DEPTH)와 같은 값. 넘으면 저장이 거부된다. */
const MAX_DEPTH = 3;

const DEPTH_LABEL: Record<number, string> = { 1: "대분류", 2: "중분류", 3: "소분류" };

const PANEL_DESCRIPTION =
  "위젯 초기 화면에 노출할 최대 3단 메뉴를 관리합니다. 분류를 만들고 그 아래 하위 분류나 질문 버튼을 추가하면, 사용자가 버튼을 눌러 단계별로 좁혀가며 답변을 받을 수 있습니다.";

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    // request()가 서버의 실제 검증 메시지(예: "메뉴는 3단까지만 만들 수 있습니다.")를
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
  // 노드마다 '하위 분류'와 '질문' 입력칸이 따로 있으므로 `${부모id}:${유형}`으로 구분한다.
  const [childInputs, setChildInputs] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

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
      setTree(await getMenuTree(chatbotId));
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

  function inputKey(parentId: string, actionType: MenuActionType) {
    return `${parentId}:${actionType}`;
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

  /** 하위 항목 추가. actionType이 "question"이면 라벨이 곧 챗봇에 보낼 문구가 된다. */
  async function handleAddChild(parent: MenuNode, actionType: MenuActionType) {
    const key = inputKey(parent.id, actionType);
    const label = (childInputs[key] ?? "").trim();
    if (!label || !chatbotId) return;
    setBusy(parent.id, true);
    setError(null);
    try {
      await createMenuNode({
        chatbotId,
        label,
        actionType,
        parentId: parent.id,
        ...(actionType === "question" ? { payload: label } : {}),
        sortOrder: parent.children.length + 1,
      });
      setChildInputs((prev) => ({ ...prev, [key]: "" }));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(parent.id, false);
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
  async function handleRename(node: MenuNode) {
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
        ...(node.actionType === "question" ? { payload: label } : {}),
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

  async function handleDelete(node: MenuNode) {
    if (!chatbotId) return;
    const confirmMessage =
      node.children.length > 0
        ? `"${node.label}" 항목을 삭제하시겠습니까? 하위 항목도 함께 삭제됩니다.`
        : `"${node.label}" 항목을 삭제하시겠습니까?`;
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

  /** 이름 편집 중일 때 쓰는 입력줄. 분류·질문 어느 단계에서나 같은 모양. */
  function renderEditor(node: MenuNode, compact: boolean) {
    return (
      <>
        <input
          value={editingLabel}
          onChange={(e) => setEditingLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename(node);
            if (e.key === "Escape") cancelEditing();
          }}
          autoFocus
          className="input-field"
          style={compact ? { flex: 1, fontSize: 13 } : { maxWidth: 280, fontWeight: 700 }}
        />
        <button
          type="button"
          onClick={() => void handleRename(node)}
          disabled={busyIds.has(node.id) || !editingLabel.trim()}
          className="btn-primary"
          style={compact ? { padding: "5px 12px", fontSize: 12 } : undefined}
        >
          저장
        </button>
        <button
          type="button"
          onClick={cancelEditing}
          className="btn-secondary"
          style={compact ? { padding: "5px 12px", fontSize: 12 } : undefined}
        >
          취소
        </button>
      </>
    );
  }

  /** 하위 항목을 추가하는 입력줄. 분류(다음 단계가 남았을 때)와 질문 두 종류. */
  function renderAddChild(node: MenuNode, depth: number) {
    const canAddCategory = depth + 1 < MAX_DEPTH; // 마지막 단계에는 분류를 둘 수 없다
    const rows: { actionType: MenuActionType; placeholder: string; buttonLabel: string }[] = [
      {
        actionType: "question",
        placeholder: "예: 신청 방법이 궁금해요",
        buttonLabel: "질문 추가",
      },
    ];
    if (canAddCategory) {
      rows.unshift({
        actionType: "category",
        placeholder: `예: ${DEPTH_LABEL[depth + 1] ?? "하위 분류"} 이름`,
        buttonLabel: `${DEPTH_LABEL[depth + 1] ?? "하위 분류"} 추가`,
      });
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => {
          const key = inputKey(node.id, row.actionType);
          return (
            <div key={row.actionType} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={childInputs[key] ?? ""}
                onChange={(e) => setChildInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddChild(node, row.actionType);
                }}
                placeholder={row.placeholder}
                className="input-field"
              />
              <button
                type="button"
                onClick={() => void handleAddChild(node, row.actionType)}
                disabled={busyIds.has(node.id) || !(childInputs[key] ?? "").trim()}
                className="btn-secondary"
              >
                <Plus style={{ width: 13, height: 13 }} />
                {row.buttonLabel}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  /**
   * 노드 하나와 그 하위를 그린다.
   *
   * depth 1은 카드, 2단 이하는 들여쓴 상자로 표현한다. 분류가 아닌 노드(질문·링크)는
   * 하위를 가질 수 없으므로 한 줄로만 그린다 — 2단 시절 질문 목록과 같은 모양이다.
   */
  function renderNode(node: MenuNode, siblings: MenuNode[], index: number, depth: number) {
    const isEditing = editingId === node.id;
    const isBusy = busyIds.has(node.id);
    const isCategory = node.actionType === "category";
    const isFirst = index === 0;
    const isLast = index === siblings.length - 1;

    const moveButtons = (compact: boolean) => (
      <>
        <button
          type="button"
          onClick={() => void handleMove(node, siblings, -1)}
          disabled={isBusy || isFirst}
          title="위로"
          className={compact ? undefined : "btn-secondary"}
          style={
            compact
              ? {
                  background: "none",
                  border: "none",
                  cursor: isFirst ? "default" : "pointer",
                  color: isFirst ? "#e5e7eb" : "#9ca3af",
                }
              : { padding: "6px 9px" }
          }
        >
          <ChevronUp style={{ width: compact ? 15 : 14, height: compact ? 15 : 14 }} />
        </button>
        <button
          type="button"
          onClick={() => void handleMove(node, siblings, 1)}
          disabled={isBusy || isLast}
          title="아래로"
          className={compact ? undefined : "btn-secondary"}
          style={
            compact
              ? {
                  background: "none",
                  border: "none",
                  cursor: isLast ? "default" : "pointer",
                  color: isLast ? "#e5e7eb" : "#9ca3af",
                }
              : { padding: "6px 9px" }
          }
        >
          <ChevronDown style={{ width: compact ? 15 : 14, height: compact ? 15 : 14 }} />
        </button>
      </>
    );

    // 분류가 아니면 한 줄짜리 항목.
    if (!isCategory) {
      return (
        <div
          key={node.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "#f9fafb",
            borderRadius: 8,
          }}
        >
          {isEditing ? (
            renderEditor(node, true)
          ) : (
            <>
              <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>{node.label}</span>
              {!node.isEnabled && <span className="badge-neutral">숨김</span>}
              {moveButtons(true)}
              <button
                type="button"
                onClick={() => startEditing(node)}
                disabled={isBusy}
                title="이름 수정"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
              >
                <Pencil style={{ width: 14, height: 14 }} />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(node)}
                disabled={isBusy}
                title="삭제"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db" }}
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </>
          )}
        </div>
      );
    }

    const containerStyle =
      depth === 1
        ? { padding: 16 }
        : {
            padding: 12,
            marginLeft: 12,
            borderLeft: "2px solid #e5e7eb",
            background: "#fcfcfd",
            borderRadius: 8,
          };

    return (
      <div key={node.id} className={depth === 1 ? "card" : undefined} style={containerStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          {isEditing ? (
            renderEditor(node, false)
          ) : (
            <>
              <span
                style={{
                  fontSize: depth === 1 ? 14 : 13,
                  fontWeight: 700,
                  color: depth === 1 ? "#111827" : "#374151",
                }}
              >
                {node.label}
              </span>
              <span className="badge-neutral">{DEPTH_LABEL[depth] ?? `${depth}단`}</span>
              {node.children.length === 0 && (
                <span className="badge-warning">하위 항목 없음 — 위젯에 표시되지 않습니다</span>
              )}
              {!node.isEnabled && <span className="badge-neutral">숨김</span>}
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {!isEditing && (
              <>
                {moveButtons(false)}
                <button
                  type="button"
                  onClick={() => startEditing(node)}
                  disabled={isBusy}
                  className="btn-secondary"
                >
                  <Pencil style={{ width: 13, height: 13 }} />
                  이름 수정
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleToggleEnabled(node)}
              disabled={isBusy}
              className="btn-secondary"
            >
              {node.isEnabled ? (
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
              onClick={() => void handleDelete(node)}
              disabled={isBusy}
              className="btn-danger"
            >
              <Trash2 style={{ width: 13, height: 13 }} />
              삭제
            </button>
          </div>
        </div>

        {node.children.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {node.children.map((child, childIndex) =>
              renderNode(child, node.children, childIndex, depth + 1),
            )}
          </div>
        )}

        {renderAddChild(node, depth)}
      </div>
    );
  }

  if (!chatbotId) {
    return (
      <div className="space-y-4">
        <PagePanel title="탐색 메뉴" description={PANEL_DESCRIPTION}>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            좌측 상단에서 챗봇을 먼저 선택해 주세요.
          </p>
        </PagePanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PagePanel title="탐색 메뉴" description={PANEL_DESCRIPTION}>
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
          <div
            style={{
              padding: "24px 16px",
              background: "#f9fafb",
              borderRadius: 10,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>등록된 대분류가 없습니다.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tree.map((node, index) => renderNode(node, tree, index, 1))}
          </div>
        )}
      </PagePanel>
    </div>
  );
}

"use client";

import { useState } from "react";
import { bulkRegisterFaq, generateFaqFromKnowledge } from "../../lib/api/knowledge";
import type { FaqItem } from "../../lib/api/knowledge";

const CHATBOT_STORAGE_KEY = "ieumbot_admin_chatbot_id";

type EditableFaqItem = FaqItem & { id: string; selected: boolean; editing: boolean };

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

type Props = {
  knowledgeId: string;
  knowledgeTitle: string;
  onClose: () => void;
  onRegistered: (count: number) => void;
};

export function FaqGenerateModal({ knowledgeId, knowledgeTitle, onClose, onRegistered }: Props) {
  const [chatbotId, setChatbotId] = useState<string>(() => {
    try { return window.localStorage.getItem(CHATBOT_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [faqCount, setFaqCount] = useState(5);
  const [items, setItems] = useState<EditableFaqItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCount = items.filter((i) => i.selected).length;

  const handleGenerate = async () => {
    const cid = chatbotId.trim();
    if (!cid) { setError("챗봇 ID를 입력하세요."); return; }
    try { window.localStorage.setItem(CHATBOT_STORAGE_KEY, cid); } catch { /* ignore */ }

    setIsGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await generateFaqFromKnowledge(knowledgeId, cid, faqCount);
      if (resp.generated.length === 0) {
        setError("생성된 FAQ가 없습니다. 문서에 충분한 내용이 있는지 확인하세요.");
        return;
      }
      setItems(
        resp.generated.map((faq) => ({
          ...faq,
          id: makeId(),
          selected: true,
          editing: false,
        })),
      );
      setNotice(`${resp.generated.length}개의 FAQ가 생성되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "FAQ 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegister = async () => {
    const cid = chatbotId.trim();
    if (!cid) { setError("챗봇 ID를 입력하세요."); return; }
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) { setError("등록할 항목을 선택하세요."); return; }

    setIsRegistering(true);
    setError(null);
    setNotice("등록 중입니다...");
    try {
      const resp = await bulkRegisterFaq({
        chatbotId: cid,
        faqs: selected.map(({ question, answer }) => ({ question, answer })),
      });
      onRegistered(resp.registered);
      if (resp.failed > 0) {
        setNotice(`${resp.registered}개 등록 완료, ${resp.failed}개 실패.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
      setIsRegistering(false);
      setNotice(null);
    }
  };

  const toggleItem = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));

  const toggleAll = () => {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const toggleEdit = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, editing: !i.editing } : i)));

  const updateField = (id: string, field: "question" | "answer", value: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">FAQ 자동 생성</h2>
            <p className="mt-0.5 text-xs text-slate-500 max-w-sm truncate">{knowledgeTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            ✕ 닫기
          </button>
        </div>

        {/* 설정 + 생성 */}
        <div className="border-b border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>챗봇 ID</span>
              <input
                type="text"
                value={chatbotId}
                onChange={(e) => setChatbotId(e.target.value)}
                placeholder="UUID"
                className="w-60 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>생성 개수</span>
              <select
                value={faqCount}
                onChange={(e) => setFaqCount(Number(e.target.value))}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}개</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating || isRegistering}
              className="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {isGenerating ? "생성 중..." : items.length > 0 ? "재생성" : "FAQ 생성"}
            </button>
          </div>
          {notice && <p className="mt-2 text-xs text-emerald-700">{notice}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        {/* FAQ 목록 */}
        {items.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="toggle-all"
                checked={selectedCount === items.length}
                onChange={toggleAll}
                className="size-4"
              />
              <label htmlFor="toggle-all" className="text-xs text-slate-500">
                전체 선택 ({selectedCount}/{items.length})
              </label>
            </div>

            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItem(item.id)}
                    className="mt-1 size-4 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    {item.editing ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs font-medium text-slate-500">Q</label>
                          <textarea
                            rows={2}
                            value={item.question}
                            onChange={(e) => updateField(item.id, "question", e.target.value)}
                            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500">A</label>
                          <textarea
                            rows={3}
                            value={item.answer}
                            onChange={(e) => updateField(item.id, "answer", e.target.value)}
                            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-800">Q. {item.question}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">A. {item.answer}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleEdit(item.id)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      {item.editing ? "완료" : "편집"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            위에서 챗봇 ID와 생성 개수를 설정한 후 "FAQ 생성"을 클릭하세요.
          </div>
        )}

        {/* 하단 액션 */}
        {items.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-3">
            <span className="text-xs text-slate-500">{selectedCount}개 선택됨</span>
            <button
              type="button"
              onClick={() => void handleRegister()}
              disabled={isRegistering || selectedCount === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
            >
              {isRegistering ? "등록 중..." : `선택 항목 등록 (${selectedCount}개)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { analyzeFaqFromKnowledge, bulkCreateFaq } from "../../lib/api/admin-operations";
import type { FaqAnalyzedTopic } from "../../lib/api/admin-operations-types";

type SelectableFaq = {
  uid: string;
  selected: boolean;
  editing: boolean;
  question: string;
  answer: string;
  tags: string[];
  topic: string;
  category: string | null;
  field: string | null;
};

type TopicState = Omit<FaqAnalyzedTopic, "faqs"> & {
  faqs: SelectableFaq[];
  expanded: boolean;
};

function makeUid() {
  return Math.random().toString(36).slice(2, 10);
}

function AnswerEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline],
    content: initialHtml.includes("<") ? initialHtml : `<p>${initialHtml.replace(/\n/g, "</p><p>")}</p>`,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        style: "min-height:80px;padding:8px 10px;outline:none;font-size:12px;line-height:1.7;color:#374151;",
      },
    },
  });
  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", overflow: "hidden" }}>
      <EditorContent editor={editor} />
    </div>
  );
}

type Props = {
  knowledgeId: string;
  knowledgeTitle: string;
  chatbotId: string;
  onClose: () => void;
  onRegistered: (count: number) => void;
};

export function FaqAnalyzeModal({
  knowledgeId,
  knowledgeTitle,
  chatbotId,
  onClose,
  onRegistered,
}: Props) {
  const [maxTopics, setMaxTopics] = useState(6);
  const [faqsPerTopic, setFaqsPerTopic] = useState(2);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalSelected = topics.reduce(
    (sum, t) => sum + t.faqs.filter((f) => f.selected).length,
    0,
  );

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    setNotice(null);
    setTopics([]);
    try {
      const resp = await analyzeFaqFromKnowledge(knowledgeId, {
        chatbotId,
        maxTopics,
        faqsPerTopic,
      });
      if (resp.topics.length === 0) {
        setError("생성된 FAQ가 없습니다. 문서에 충분한 내용이 있는지 확인하세요.");
        return;
      }
      setTopics(
        resp.topics.map((t) => ({
          ...t,
          expanded: true,
          faqs: t.faqs.map((f) => ({ ...f, uid: makeUid(), selected: true, editing: false })),
        })),
      );
      setNotice(`${resp.topics.length}개 주제, ${resp.totalFaqs}개 FAQ가 분석되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "분석에 실패했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRegister = async () => {
    const selected = topics.flatMap((t) =>
      t.faqs
        .filter((f) => f.selected)
        .map((f) => ({
          question: f.question,
          answer: f.answer,
          tags: f.tags,
          category: f.category,
          field: f.field,
        })),
    );
    if (selected.length === 0) {
      setError("등록할 항목을 선택하세요.");
      return;
    }
    setIsRegistering(true);
    setError(null);
    setNotice("등록 중입니다...");
    try {
      const resp = await bulkCreateFaq(chatbotId, selected);
      onRegistered(resp.created);
      if (resp.failed > 0) {
        setNotice(`${resp.created}개 등록 완료, ${resp.failed}개 실패.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
      setIsRegistering(false);
      setNotice(null);
    }
  };

  const toggleFaq = (topicIdx: number, uid: string) =>
    setTopics((prev) =>
      prev.map((t, i) =>
        i !== topicIdx
          ? t
          : { ...t, faqs: t.faqs.map((f) => (f.uid === uid ? { ...f, selected: !f.selected } : f)) },
      ),
    );

  const toggleTopicAll = (topicIdx: number) =>
    setTopics((prev) =>
      prev.map((t, i) => {
        if (i !== topicIdx) return t;
        const allSelected = t.faqs.every((f) => f.selected);
        return { ...t, faqs: t.faqs.map((f) => ({ ...f, selected: !allSelected })) };
      }),
    );

  const toggleExpand = (topicIdx: number) =>
    setTopics((prev) =>
      prev.map((t, i) => (i === topicIdx ? { ...t, expanded: !t.expanded } : t)),
    );

  const toggleEdit = (topicIdx: number, uid: string) =>
    setTopics((prev) =>
      prev.map((t, i) =>
        i !== topicIdx
          ? t
          : { ...t, faqs: t.faqs.map((f) => (f.uid === uid ? { ...f, editing: !f.editing } : f)) },
      ),
    );

  const updateFaqField = (
    topicIdx: number,
    uid: string,
    field: "question" | "answer",
    value: string,
  ) =>
    setTopics((prev) =>
      prev.map((t, i) =>
        i !== topicIdx
          ? t
          : { ...t, faqs: t.faqs.map((f) => (f.uid === uid ? { ...f, [field]: value } : f)) },
      ),
    );

  const removeFaq = (topicIdx: number, uid: string) =>
    setTopics((prev) =>
      prev.map((t, i) =>
        i !== topicIdx ? t : { ...t, faqs: t.faqs.filter((f) => f.uid !== uid) },
      ),
    );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(15,23,42,.45)",
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,.22)",
          width: "100%", maxWidth: 760, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #e5e7eb" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>FAQ 재분석</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {knowledgeTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 13, color: "#6b7280", cursor: "pointer" }}
          >
            닫기
          </button>
        </div>

        {/* 설정 + 분석 버튼 */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6b7280" }}>
            주제 수
            <select
              value={maxTopics}
              onChange={(e) => setMaxTopics(Number(e.target.value))}
              style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            >
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}개</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6b7280" }}>
            주제당 FAQ 수
            <select
              value={faqsPerTopic}
              onChange={(e) => setFaqsPerTopic(Number(e.target.value))}
              style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}개</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing || isRegistering}
            style={{
              padding: "7px 18px", border: "none", borderRadius: 8,
              background: isAnalyzing || isRegistering ? "#94a3b8" : "#1e293b",
              color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: isAnalyzing || isRegistering ? "not-allowed" : "pointer",
            }}
          >
            {isAnalyzing ? "분석 중..." : topics.length > 0 ? "재분석" : "FAQ 분석"}
          </button>
          {notice && <span style={{ fontSize: 12, color: "#059669" }}>{notice}</span>}
          {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
        </div>

        {/* 주제별 FAQ 목록 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 16px" }}>
          {isAnalyzing ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              <div style={{ marginBottom: 12, fontSize: 30 }}>🔍</div>
              문서를 분석하고 있습니다. 잠시 기다려 주세요...
            </div>
          ) : topics.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              주제 수와 FAQ 수를 설정한 후 &quot;FAQ 분석&quot;을 클릭하세요.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topics.map((topic, topicIdx) => {
                const selectedInTopic = topic.faqs.filter((f) => f.selected).length;
                return (
                  <div
                    key={topic.topic}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}
                  >
                    {/* 주제 헤더 */}
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", background: "#f8fafc",
                        cursor: "pointer", userSelect: "none",
                      }}
                      onClick={() => toggleExpand(topicIdx)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInTopic === topic.faqs.length && topic.faqs.length > 0}
                        onChange={() => toggleTopicAll(topicIdx)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 14, height: 14, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{topic.topic}</span>
                        {topic.category && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "#6b7280", background: "#f1f5f9", borderRadius: 20, padding: "1px 8px" }}>
                            {topic.category}{topic.field ? ` / ${topic.field}` : ""}
                          </span>
                        )}
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{topic.description}</div>
                      </div>
                      <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>
                        {selectedInTopic}/{topic.faqs.length} 선택
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        {topic.expanded ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* FAQ 목록 */}
                    {topic.expanded && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {topic.faqs.map((faq) => (
                          <div
                            key={faq.uid}
                            style={{
                              display: "flex", alignItems: "flex-start", gap: 10,
                              padding: "10px 14px", borderTop: "1px solid #f1f5f9",
                              background: faq.selected ? "#fff" : "#fafafa",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={faq.selected}
                              onChange={() => toggleFaq(topicIdx, faq.uid)}
                              style={{ width: 14, height: 14, marginTop: 3, flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {faq.editing ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 2 }}>Q</div>
                                    <textarea
                                      rows={2}
                                      value={faq.question}
                                      onChange={(e) => updateFaqField(topicIdx, faq.uid, "question", e.target.value)}
                                      style={{ width: "100%", padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 2 }}>A</div>
                                    <AnswerEditor
                                      initialHtml={faq.answer}
                                      onChange={(html) => updateFaqField(topicIdx, faq.uid, "answer", html)}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 3 }}>
                                    Q. {faq.question}
                                  </div>
                                  <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>
                                    A. {faq.answer}
                                  </div>
                                  {faq.tags.length > 0 && (
                                    <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                                      {faq.tags.map((tag) => (
                                        <span
                                          key={tag}
                                          style={{ fontSize: 10, border: "1px solid #e5e7eb", borderRadius: 20, padding: "1px 7px", color: "#6b7280" }}
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: 1 }}>
                              <button
                                type="button"
                                onClick={() => toggleEdit(topicIdx, faq.uid)}
                                style={{ padding: "3px 8px", border: "1px solid #e2e8f0", borderRadius: 5, background: "#fff", fontSize: 11, color: "#64748b", cursor: "pointer" }}
                              >
                                {faq.editing ? "완료" : "편집"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFaq(topicIdx, faq.uid)}
                                style={{ padding: "3px 8px", border: "1px solid #fca5a5", borderRadius: 5, background: "#fff", fontSize: 11, color: "#dc2626", cursor: "pointer" }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        {topics.length > 0 && (
          <div
            style={{
              borderTop: "1px solid #e5e7eb", padding: "12px 24px",
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
            }}
          >
            <span style={{ fontSize: 12, color: "#6b7280" }}>{totalSelected}개 선택됨</span>
            <button
              type="button"
              onClick={() => void handleRegister()}
              disabled={isRegistering || totalSelected === 0}
              style={{
                padding: "8px 20px", border: "none", borderRadius: 8,
                background: isRegistering || totalSelected === 0 ? "#94a3b8" : "#2563eb",
                color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: isRegistering || totalSelected === 0 ? "not-allowed" : "pointer",
              }}
            >
              {isRegistering ? "등록 중..." : `선택 항목 등록 (${totalSelected}개)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

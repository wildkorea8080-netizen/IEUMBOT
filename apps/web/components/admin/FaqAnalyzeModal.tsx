"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { ChevronRight, Loader2 } from "lucide-react";
import { analyzeFaqFromKnowledge, bulkCreateFaq } from "../../lib/api/admin-operations";

function makeUid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EditableFaq = {
  uid: string;
  selected: boolean;
  question: string;
  answer: string;
  tags: string[];
  category: string | null;
  field: string | null;
};

type TopicState = {
  uid: string;
  topic: string;
  description: string;
  category: string | null;
  field: string | null;
  faqs: EditableFaq[];
  status: "pending" | "registered";
};

// ── Analysis Loading Screen ───────────────────────────────────────────────────

function AnalysisScreen({ step }: { step: number }) {
  type StepStatus = "done" | "active" | "pending";
  const steps: { label: string; status: StepStatus }[] = [
    {
      label: step >= 1 ? "1단계: 주제 클러스터 추출 완료!" : "1단계: 문서 청크 분석 및 주제 추출 중...",
      status: step >= 1 ? "done" : "active",
    },
    {
      label: step >= 2 ? "2단계: 주제별 FAQ 생성 완료!" : "2단계: 주제별 FAQ 생성 중...",
      status: step === 0 ? "pending" : step === 1 ? "active" : "done",
    },
  ];
  const borderColor: Record<StepStatus, string> = { done: "#86efac", active: "#93c5fd", pending: "#e5e7eb" };
  const bgColor: Record<StepStatus, string> = { done: "#f0fdf4", active: "#eff6ff", pending: "#f9fafb" };
  const textColor: Record<StepStatus, string> = { done: "#15803d", active: "#1d4ed8", pending: "#9ca3af" };

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "40px 48px", textAlign: "center", width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Loader2 style={{ width: 44, height: 44, color: "#2563eb", animation: "faq-spin 1s linear infinite" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>AI가 FAQ를 분석하고 있습니다</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>
          문서를 주제별로 분류하고 FAQ를 생성합니다. 잠시만 기다려 주세요.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                border: `1px solid ${borderColor[s.status]}`,
                borderRadius: 12, background: bgColor[s.status],
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: textColor[s.status], flex: 1, textAlign: "left" }}>
                {s.label}
              </span>
              {s.status === "done" && <span style={{ color: "#16a34a" }}>✓</span>}
              {s.status === "active" && (
                <Loader2 style={{ width: 14, height: 14, color: "#2563eb", animation: "faq-spin 1s linear infinite", flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Left Panel: Topic List Item ───────────────────────────────────────────────

function TopicListItem({ topic, isSelected, isChecked, onClick, onToggle }: {
  topic: TopicState;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  const selectedFaqCount = topic.faqs.filter((f) => f.selected).length;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 14px",
        borderLeft: `3px solid ${isSelected ? "#2563eb" : "transparent"}`,
        background: isSelected ? "#eff6ff" : topic.status === "registered" ? "#f0fdf4" : "transparent",
        cursor: "pointer",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Custom checkbox */}
        <div
          onClick={(e) => { e.stopPropagation(); if (topic.status === "pending") onToggle(); }}
          style={{ marginTop: 3, flexShrink: 0, cursor: topic.status === "pending" ? "pointer" : "default" }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: 4,
            border: `2px solid ${isChecked ? "#2563eb" : "#d1d5db"}`,
            background: isChecked ? "#2563eb" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isChecked && (
              <div style={{ width: 8, height: 5, borderLeft: "2px solid #fff", borderBottom: "2px solid #fff", transform: "rotate(-45deg) translate(1px,-1px)" }} />
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: topic.status === "registered" ? "#16a34a" : "#f59e0b",
            }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {topic.topic}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 3 }}>
            {topic.status === "registered" ? (
              <span style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>등록완료</span>
            ) : (
              <span style={{ fontSize: 10, background: "#eff6ff", color: "#1d4ed8", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>신규등록</span>
            )}
            {topic.category && (
              <span style={{ fontSize: 10, background: "#f1f5f9", color: "#6b7280", borderRadius: 4, padding: "1px 7px" }}>
                {topic.category}{topic.field ? ` / ${topic.field}` : ""}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            {selectedFaqCount}/{topic.faqs.length} FAQ 선택
          </div>
        </div>

        <ChevronRight style={{ width: 13, height: 13, color: "#d1d5db", flexShrink: 0, marginTop: 4 }} />
      </div>
    </div>
  );
}

// ── FAQ Answer TipTap Editor ──────────────────────────────────────────────────

function FaqAnswerEditor({ initialAnswer, onChange }: { initialAnswer: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline],
    content: initialAnswer.includes("<")
      ? initialAnswer
      : `<p>${initialAnswer.replace(/\n/g, "</p><p>") || ""}</p>`,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        style: "min-height:90px;padding:8px 10px;outline:none;font-size:13px;line-height:1.7;color:#374151;",
      },
    },
  });
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, background: "#fafafa", overflow: "hidden" }}>
      <EditorContent editor={editor} />
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

type Props = {
  knowledgeId: string;
  knowledgeTitle: string;
  chatbotId: string;
  onClose: () => void;
  onRegistered: (count: number) => void;
};

export function FaqAnalyzeModal({ knowledgeId, knowledgeTitle, chatbotId, onClose, onRegistered }: Props) {
  const [topics, setTopics] = useState<TopicState[]>([]);
  const [selectedTopicUid, setSelectedTopicUid] = useState<string | null>(null);
  const [checkedTopicUids, setCheckedTopicUids] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  const selectedTopic = topics.find((t) => t.uid === selectedTopicUid) ?? null;
  const pendingTopics = topics.filter((t) => t.status === "pending");
  const checkedFaqCount = Array.from(checkedTopicUids).reduce((sum, uid) => {
    const t = topics.find((x) => x.uid === uid);
    return sum + (t ? t.faqs.filter((f) => f.selected).length : 0);
  }, 0);

  // Auto-analyze on mount
  useEffect(() => {
    void runAnalyze();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAnalyze() {
    setIsAnalyzing(true);
    setAnalysisStep(0);
    setError(null);
    setTopics([]);
    setSelectedTopicUid(null);
    setCheckedTopicUids(new Set());
    setTagInputs({});

    const t1 = setTimeout(() => setAnalysisStep(1), 8000);
    try {
      const resp = await analyzeFaqFromKnowledge(knowledgeId, {
        chatbotId,
        maxTopics: 6,
        faqsPerTopic: 2,
      });
      clearTimeout(t1);
      setAnalysisStep(2);

      if (resp.topics.length === 0) {
        setError("생성된 FAQ가 없습니다. 문서에 충분한 내용이 있는지 확인하세요.");
        return;
      }

      const topicStates: TopicState[] = resp.topics.map((t) => ({
        uid: makeUid(),
        topic: t.topic,
        description: t.description,
        category: t.category,
        field: t.field,
        status: "pending",
        faqs: t.faqs.map((f) => ({
          uid: makeUid(),
          selected: true,
          question: f.question,
          answer: f.answer,
          tags: [...f.tags],
          category: f.category,
          field: f.field,
        })),
      }));

      setTopics(topicStates);
      setCheckedTopicUids(new Set(topicStates.map((t) => t.uid)));
      if (topicStates[0]) setSelectedTopicUid(topicStates[0].uid);
    } catch (err) {
      clearTimeout(t1);
      setError(err instanceof Error ? err.message : "분석에 실패했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleRegister() {
    const items: Array<{ question: string; answer: string; tags: string[]; category: string | null; field: string | null }> = [];
    for (const uid of checkedTopicUids) {
      const t = topics.find((x) => x.uid === uid);
      if (!t) continue;
      for (const faq of t.faqs.filter((f) => f.selected)) {
        items.push({ question: faq.question, answer: faq.answer, tags: faq.tags, category: faq.category, field: faq.field });
      }
    }
    if (items.length === 0) { setError("등록할 항목을 선택하세요."); return; }

    setIsRegistering(true);
    setError(null);
    try {
      const resp = await bulkCreateFaq(chatbotId, items);
      setTopics((prev) => prev.map((t) => checkedTopicUids.has(t.uid) ? { ...t, status: "registered" as const } : t));
      setCheckedTopicUids(new Set());
      onRegistered(resp.created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setIsRegistering(false);
    }
  }

  function toggleTopicCheck(uid: string) {
    setCheckedTopicUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  function toggleAll() {
    const pendingUids = pendingTopics.map((t) => t.uid);
    setCheckedTopicUids((prev) =>
      prev.size === pendingUids.length ? new Set() : new Set(pendingUids)
    );
  }

  function updateFaq(topicUid: string, faqUid: string, patch: Partial<EditableFaq>) {
    setTopics((prev) =>
      prev.map((t) =>
        t.uid !== topicUid ? t : { ...t, faqs: t.faqs.map((f) => f.uid !== faqUid ? f : { ...f, ...patch }) }
      )
    );
  }

  function removeFaq(topicUid: string, faqUid: string) {
    setTopics((prev) =>
      prev.map((t) => t.uid !== topicUid ? t : { ...t, faqs: t.faqs.filter((f) => f.uid !== faqUid) })
    );
  }

  function addFaq(topicUid: string) {
    const topic = topics.find((t) => t.uid === topicUid);
    setTopics((prev) =>
      prev.map((t) =>
        t.uid !== topicUid ? t : {
          ...t,
          faqs: [...t.faqs, {
            uid: makeUid(), selected: true, question: "", answer: "",
            tags: [], category: topic?.category ?? null, field: topic?.field ?? null,
          }],
        }
      )
    );
  }

  function addTagToFaq(topicUid: string, faqUid: string) {
    const input = (tagInputs[faqUid] ?? "").trim();
    if (!input) return;
    setTopics((prev) =>
      prev.map((t) =>
        t.uid !== topicUid ? t : {
          ...t,
          faqs: t.faqs.map((f) =>
            f.uid !== faqUid ? f : { ...f, tags: f.tags.includes(input) ? f.tags : [...f.tags, input] }
          ),
        }
      )
    );
    setTagInputs((prev) => ({ ...prev, [faqUid]: "" }));
  }

  function removeTag(topicUid: string, faqUid: string, tag: string) {
    setTopics((prev) =>
      prev.map((t) =>
        t.uid !== topicUid ? t : {
          ...t,
          faqs: t.faqs.map((f) => f.uid !== faqUid ? f : { ...f, tags: f.tags.filter((tg) => tg !== tag) }),
        }
      )
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f1f5f9", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>FAQ 재분석</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1, maxWidth: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {knowledgeTitle}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isAnalyzing && topics.length > 0 && (
            <button
              type="button"
              onClick={() => void runAnalyze()}
              disabled={isRegistering}
              style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 12, color: "#6b7280", cursor: "pointer" }}
            >
              재분석
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 13, color: "#6b7280", cursor: "pointer" }}
          >
            닫기
          </button>
        </div>
      </div>

      {/* Body */}
      {isAnalyzing ? (
        <AnalysisScreen step={analysisStep} />
      ) : error && topics.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
          <button
            type="button"
            onClick={() => void runAnalyze()}
            style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", fontSize: 13, cursor: "pointer" }}
          >
            다시 시도
          </button>
        </div>
      ) : topics.length > 0 ? (
        <div style={{ flex: 1, display: "flex", padding: "12px 24px 0", overflow: "hidden", minHeight: 0, gap: 0 }}>

          {/* ① Left: topic list */}
          <div style={{
            width: 290, flexShrink: 0, background: "#fff",
            border: "1px solid #e5e7eb", borderRadius: "14px 14px 0 0",
            display: "flex", flexDirection: "column", overflow: "hidden", marginRight: 12,
          }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>분석된 주제</span>
                <button
                  type="button"
                  onClick={toggleAll}
                  style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}
                >
                  {checkedTopicUids.size === pendingTopics.length ? "전체 해제" : "전체 선택"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                주제를 클릭하면 에디터 화면에서 내용을 확인하고 바로 수정할 수 있습니다.
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {topics.map((topic) => (
                <TopicListItem
                  key={topic.uid}
                  topic={topic}
                  isSelected={selectedTopicUid === topic.uid}
                  isChecked={checkedTopicUids.has(topic.uid)}
                  onClick={() => setSelectedTopicUid(topic.uid)}
                  onToggle={() => toggleTopicCheck(topic.uid)}
                />
              ))}
            </div>
          </div>

          {/* ② Right: FAQ editor */}
          <div style={{
            flex: 1, background: "#fff",
            border: "1px solid #e5e7eb", borderRadius: "14px 14px 0 0",
            display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0,
          }}>
            {selectedTopic ? (
              <>
                {/* Topic header */}
                <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 20, marginTop: 1 }}>📄</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{selectedTopic.topic}</div>
                      {selectedTopic.category && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {selectedTopic.category}{selectedTopic.field ? ` / ${selectedTopic.field}` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedTopic.description && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8, lineHeight: 1.5, paddingLeft: 30 }}>
                      {selectedTopic.description}
                    </div>
                  )}
                </div>

                {/* FAQ items */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 16px" }}>
                  {selectedTopic.faqs.map((faq, faqIdx) => (
                    <div
                      key={faq.uid}
                      style={{
                        border: "1px solid #e5e7eb", borderRadius: 10,
                        padding: "14px 16px", marginBottom: 12,
                        background: faq.selected ? "#fff" : "#f9fafb",
                      }}
                    >
                      {/* FAQ header row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
                          onClick={() => updateFaq(selectedTopic.uid, faq.uid, { selected: !faq.selected })}>
                          <div style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${faq.selected ? "#2563eb" : "#d1d5db"}`,
                            background: faq.selected ? "#2563eb" : "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {faq.selected && (
                              <div style={{ width: 8, height: 5, borderLeft: "2px solid #fff", borderBottom: "2px solid #fff", transform: "rotate(-45deg) translate(1px,-1px)" }} />
                            )}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>FAQ {faqIdx + 1}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFaq(selectedTopic.uid, faq.uid)}
                          style={{ padding: "3px 8px", border: "1px solid #fca5a5", borderRadius: 5, background: "#fff", fontSize: 11, color: "#dc2626", cursor: "pointer" }}
                        >
                          삭제
                        </button>
                      </div>

                      {/* Q */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Q (질문)</div>
                        <textarea
                          rows={2}
                          value={faq.question}
                          onChange={(e) => updateFaq(selectedTopic.uid, faq.uid, { question: e.target.value })}
                          style={{
                            width: "100%", padding: "8px 10px",
                            border: "1px solid #e5e7eb", borderRadius: 6,
                            fontSize: 13, resize: "vertical", boxSizing: "border-box",
                            fontFamily: "inherit", lineHeight: 1.6, outline: "none",
                          }}
                        />
                      </div>

                      {/* A */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>A (답변)</div>
                        <FaqAnswerEditor
                          key={faq.uid}
                          initialAnswer={faq.answer}
                          onChange={(html) => updateFaq(selectedTopic.uid, faq.uid, { answer: html })}
                        />
                      </div>

                      {/* Tags */}
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                          {faq.tags.map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 11, background: "#f1f5f9", border: "1px solid #e5e7eb",
                                borderRadius: 20, padding: "2px 8px", color: "#374151",
                                display: "inline-flex", alignItems: "center", gap: 3,
                              }}
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeTag(selectedTopic.uid, faq.uid, tag)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, fontSize: 13 }}
                              >×</button>
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            value={tagInputs[faq.uid] ?? ""}
                            onChange={(e) => setTagInputs((prev) => ({ ...prev, [faq.uid]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTagToFaq(selectedTopic.uid, faq.uid); } }}
                            placeholder="태그 추가 (Enter)"
                            style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 10px", fontSize: 12, outline: "none", background: "#fafafa" }}
                          />
                          <button
                            type="button"
                            onClick={() => addTagToFaq(selectedTopic.uid, faq.uid)}
                            style={{ padding: "5px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer" }}
                          >추가</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addFaq(selectedTopic.uid)}
                    style={{ width: "100%", padding: "10px", border: "1px dashed #d1d5db", borderRadius: 8, background: "#f9fafb", fontSize: 12, color: "#6b7280", cursor: "pointer" }}
                  >
                    + FAQ 추가
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
                왼쪽에서 주제를 선택하면 FAQ를 확인하고 편집할 수 있습니다.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Bottom bar */}
      {!isAnalyzing && topics.length > 0 && (
        <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "12px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0 }}>✓</span>
              1차 주제분석 분석 완료
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0 }}>✓</span>
              2차 FAQ 생성 완료
            </span>
            <span style={{ marginLeft: "auto", color: "#9ca3af" }}>선택하신 주제를 일괄 등록하실 수 있습니다.</span>
          </div>
          {error && <div style={{ marginBottom: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: "12px 0", border: "none", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => void handleRegister()}
              disabled={isRegistering || checkedFaqCount === 0}
              style={{
                flex: 2, padding: "12px 0", border: "none", borderRadius: 10,
                background: checkedFaqCount === 0 || isRegistering ? "#9ca3af" : "#111827",
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: checkedFaqCount === 0 || isRegistering ? "default" : "pointer",
              }}
            >
              {isRegistering ? "등록 중..." : `등록`}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .tiptap { min-height: 90px; }
        .tiptap p { margin: 0.3em 0; }
        .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: 0.3em 0; }
        .tiptap li { margin: 0.1em 0; }
        .tiptap strong { font-weight: 700; }
        .tiptap em { font-style: italic; }
        .tiptap u { text-decoration: underline; }
        @keyframes faq-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

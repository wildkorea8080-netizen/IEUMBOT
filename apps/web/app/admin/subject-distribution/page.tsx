"use client";

import { useEffect, useState } from "react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { getSubjectDistribution } from "../../../lib/api/conversations";
import type { AdminSubjectDistribution } from "../../../lib/api/conversations-types";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const STATUS_COLOR: Record<string, string> = {
  답변성공: "#16a34a",
  근거부족: "#d97706",
  이관: "#2563eb",
  차단: "#dc2626",
  기타: "#94a3b8",
};

export default function SubjectDistributionPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [from, setFrom] = useState(isoDate(-30));
  const [to, setTo] = useState(isoDate(0));
  const [data, setData] = useState<AdminSubjectDistribution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      if (chatbots.length === 0) {
        const res = await getAdminChatbots();
        setChatbots(res.items);
      }
      const res = await getSubjectDistribution({
        chatbotId: chatbotId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof ApiClientError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : "불러오기에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbotId, from, to]);

  const maxKeyword = Math.max(1, ...(data?.topKeywords.map(k => k.count) ?? [1]));
  const maxStatus = Math.max(1, ...(data?.statusDistribution.map(s => s.count) ?? [1]));

  const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, color: "#374151" };

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="section-title">상담 주제 분포</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
          기간 내 사용자 질문을 키워드 단위로 집계해 주로 어떤 주제를 묻는지, 답변 결과가 어떻게 분포하는지 보여줍니다.
        </p>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {chatbots.length > 1 && (
          <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} style={{ ...inputStyle, width: 200 }}>
            <option value="">전체 챗봇</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <span style={{ color: "#94a3b8" }}>~</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#64748b" }}>불러오는 중...</p>
      ) : data ? (
        <>
          <div style={{ fontSize: 13, color: "#475569" }}>
            총 질문 <strong style={{ color: "#111827" }}>{data.totalQuestions.toLocaleString()}</strong>건 (최근 5,000건 상한)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* 상위 질문 키워드 */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>상위 질문 키워드</p>
              {data.topKeywords.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94a3b8" }}>집계할 질문이 없습니다.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.topKeywords.map(k => (
                    <div key={k.keyword} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 90, fontSize: 12, color: "#334155", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.keyword}</div>
                      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 6, height: 18, position: "relative" }}>
                        <div style={{ width: `${(k.count / maxKeyword) * 100}%`, background: "#2563eb", height: "100%", borderRadius: 6, minWidth: 2 }} />
                      </div>
                      <div style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#475569" }}>{k.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 답변 결과 분포 */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>답변 결과 분포</p>
              {data.statusDistribution.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94a3b8" }}>집계할 응답이 없습니다.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.statusDistribution.map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 70, fontSize: 12, color: "#334155" }}>{s.label}</div>
                      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 6, height: 18 }}>
                        <div style={{ width: `${(s.count / maxStatus) * 100}%`, background: STATUS_COLOR[s.label] ?? "#94a3b8", height: "100%", borderRadius: 6, minWidth: 2 }} />
                      </div>
                      <div style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#475569" }}>{s.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

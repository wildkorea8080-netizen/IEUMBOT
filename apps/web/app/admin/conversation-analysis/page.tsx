"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { listConversationTraces } from "../../../lib/api/conversation-analysis";
import type {
  ConversationOutcome,
  ConversationTraceItem,
} from "../../../lib/api/conversation-analysis-types";

function outcomeBadgeClass(outcome: ConversationOutcome): string {
  if (outcome === "answered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (outcome === "insufficient_evidence") return "border-amber-200 bg-amber-50 text-amber-700";
  if (outcome === "restricted") return "border-red-200 bg-red-50 text-red-700";
  if (outcome === "conflict") return "border-orange-200 bg-orange-50 text-orange-700";
  if (outcome === "escalate") return "border-purple-200 bg-purple-50 text-purple-700";
  if (outcome === "clarification") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function outcomeLabel(outcome: ConversationOutcome): string {
  if (outcome === "answered") return "답변 완료";
  if (outcome === "insufficient_evidence") return "근거 부족";
  if (outcome === "restricted") return "정책 제한";
  if (outcome === "conflict") return "근거 충돌";
  if (outcome === "escalate") return "에스컬레이션";
  if (outcome === "clarification") return "추가 확인";
  return "미분류";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "대화 이력을 불러오지 못했습니다.";
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

function compactPreview(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "-";
  return entries
    .slice(0, 6)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" | ");
}

function stringContainsDate(isoString: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const target = new Date(isoString);
  if (Number.isNaN(target.getTime())) return true;
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime()) && target < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      const inclusiveTo = new Date(toDate.getTime());
      inclusiveTo.setHours(23, 59, 59, 999);
      if (target > inclusiveTo) return false;
    }
  }
  return true;
}

export default function ConversationAnalysisPage() {
  const [items, setItems] = useState<ConversationTraceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<ConversationOutcome | "all">("all");
  const [llmFilter, setLlmFilter] = useState<"all" | "executed" | "skipped">("all");
  const [failureOnly, setFailureOnly] = useState(false);
  const [escalationOnly, setEscalationOnly] = useState(false);
  const [missingCitationOnly, setMissingCitationOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    void loadItems();
  }, []);

  async function loadItems() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listConversationTraces();
      setItems(response.items);
      if (!selectedId && response.items.length > 0) {
        setSelectedId(response.items[0].id);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (outcomeFilter !== "all" && item.outcome !== outcomeFilter) return false;
      if (llmFilter === "executed" && item.llmExecuted !== true) return false;
      if (llmFilter === "skipped" && item.llmExecuted !== false) return false;
      if (failureOnly && (item.outcome === "answered" || item.outcome === "unknown")) return false;
      if (escalationOnly && item.outcome !== "escalate") return false;
      if (missingCitationOnly && item.citationSummary.length > 0) return false;
      if (!stringContainsDate(item.createdAt, dateFrom, dateTo)) return false;

      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const merged = [
          item.requestId,
          item.chatbotId ?? "",
          item.question ?? "",
          item.answer ?? "",
          item.policyReason ?? "",
          item.policyDecision ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!merged.includes(q)) return false;
      }
      return true;
    });
  }, [
    items,
    outcomeFilter,
    llmFilter,
    failureOnly,
    escalationOnly,
    missingCitationOnly,
    dateFrom,
    dateTo,
    searchText,
  ]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return filteredItems[0] ?? null;
    return items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  }, [selectedId, items, filteredItems]);

  return (
    <div className="space-y-4">
      <PagePanel
        title="대화 분석 트레이스"
        description="실제 답변 경로를 분석해 실패 유형, 정책 차단, 근거 부족 사례를 운영 관점에서 확인합니다."
      >
        <div className="grid gap-3">
          <div className="grid gap-3 lg:grid-cols-4">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="requestId / 질문 / 응답 / 챗봇ID 검색"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
            />
            <select
              value={outcomeFilter}
              onChange={(event) =>
                setOutcomeFilter(event.target.value as ConversationOutcome | "all")
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">전체 outcome</option>
              <option value="answered">answered</option>
              <option value="insufficient_evidence">insufficient_evidence</option>
              <option value="restricted">restricted</option>
              <option value="conflict">conflict</option>
              <option value="escalate">escalate</option>
              <option value="clarification">clarification</option>
            </select>
            <select
              value={llmFilter}
              onChange={(event) =>
                setLlmFilter(event.target.value as "all" | "executed" | "skipped")
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">LLM 전체</option>
              <option value="executed">LLM 실행</option>
              <option value="skipped">LLM 스킵</option>
            </select>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <label className="block text-xs text-slate-700">
              시작일
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-700">
              종료일
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 lg:col-span-2">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={failureOnly}
                  onChange={(event) => setFailureOnly(event.target.checked)}
                />
                실패 케이스만
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={escalationOnly}
                  onChange={(event) => setEscalationOnly(event.target.checked)}
                />
                에스컬레이션만
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={missingCitationOnly}
                  onChange={(event) => setMissingCitationOnly(event.target.checked)}
                />
                인용 없음만
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadItems}
              disabled={isLoading}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {isLoading ? "불러오는 중..." : "대화 이력 새로고침"}
            </button>
            <span className="text-xs text-slate-500">
              총 {items.length}건 / 필터 결과 {filteredItems.length}건
            </span>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </PagePanel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <PagePanel
          title="A. 세션/대화 목록"
          description="최신순으로 outcome, LLM 실행 여부, 챗봇 스코프를 확인합니다."
        >
          {filteredItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              표시할 대화가 없습니다. 필터를 조정하거나 데이터를 불러와 주세요.
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredItems.map((item) => (
                <li
                  key={item.id}
                  className={[
                    "cursor-pointer rounded-md border p-3 text-sm",
                    selectedItem?.id === item.id
                      ? "border-brand-300 bg-brand-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-xs ${outcomeBadgeClass(item.outcome)}`}>
                      {outcomeLabel(item.outcome)}
                    </span>
                    <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                      {item.llmExecuted ? "LLM 실행" : "LLM 스킵"}
                    </span>
                    <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                      {item.requestId}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-slate-900">{item.question ?? "(질문 미기록)"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    chatbot: {item.chatbotId ?? "-"} | {formatDate(item.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PagePanel>

        <div className="space-y-4">
          <PagePanel
            title="B. 대화 상세"
            description="선택한 응답의 질문/답변/결과/인용 요약을 확인합니다."
          >
            {!selectedItem ? (
              <p className="text-sm text-slate-600">선택된 대화가 없습니다.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs ${outcomeBadgeClass(selectedItem.outcome)}`}>
                    {outcomeLabel(selectedItem.outcome)}
                  </span>
                  <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                    {selectedItem.llmExecuted ? "LLM 실행" : "LLM 스킵"}
                  </span>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">사용자 질문</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-900">{selectedItem.question ?? "-"}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-500">어시스턴트 답변</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-900">{selectedItem.answer ?? "-"}</p>
                </div>
                <p className="text-xs text-slate-600">
                  created: {formatDate(selectedItem.createdAt)} | updated: {formatDate(selectedItem.updatedAt)}
                </p>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">인용 요약</p>
                  {selectedItem.citationSummary.length === 0 ? (
                    <p className="text-xs text-slate-500">인용 없음</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-slate-700">
                      {selectedItem.citationSummary.map((citation, index) => (
                        <li key={`${citation.documentVersionId ?? "none"}-${index}`}>
                          - doc={citation.documentId ?? "-"} ver={citation.documentVersionId ?? "-"} p=
                          {citation.pageNumber ?? "-"} sec={citation.sectionTitle ?? "-"} rank=
                          {citation.rank ?? "-"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </PagePanel>

          <PagePanel
            title="C. 트레이스 진단"
            description="정책 질의, 정책 차단, 가드레일, 설정 요약, 최종 경로를 확인합니다."
          >
            {!selectedItem ? (
              <p className="text-sm text-slate-600">선택된 대화가 없습니다.</p>
            ) : (
              <div className="space-y-2 text-xs text-slate-700">
                <p>requestId: {selectedItem.requestId}</p>
                <p>normalizedQuery: {String(selectedItem.rawTrace?.normalizedQuery ?? "-")}</p>
                <p>policyDecision: {selectedItem.policyDecision ?? "-"}</p>
                <p>policyReason: {selectedItem.policyReason ?? "-"}</p>
                <p>flags: {compactPreview(selectedItem.flags)}</p>
                <p>guardrailMatchedRuleIds: {(selectedItem.guardrailMatchedRuleIds ?? []).join(", ") || "-"}</p>
                <p>guardrailFinalAction: {selectedItem.guardrailFinalAction ?? "-"}</p>
                <p>effectiveSettingsSummary: {compactPreview(selectedItem.effectiveSettingsSummary)}</p>
                <p>rawTrace: {compactPreview(selectedItem.rawTrace)}</p>
              </div>
            )}
          </PagePanel>

          <PagePanel
            title="D. 검색 근거 상세"
            description="선택한 응답에서 사용한 sourceType/corpus/rank/score를 확인합니다."
          >
            {!selectedItem ? (
              <p className="text-sm text-slate-600">선택된 대화가 없습니다.</p>
            ) : selectedItem.retrievalSummary.length === 0 ? (
              <p className="text-sm text-slate-600">retrieval 요약 정보가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-2 py-1">documentId</th>
                      <th className="px-2 py-1">versionId</th>
                      <th className="px-2 py-1">sourceType</th>
                      <th className="px-2 py-1">corpusDomain</th>
                      <th className="px-2 py-1">score</th>
                      <th className="px-2 py-1">rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItem.retrievalSummary.map((source, index) => (
                      <tr key={`${source.documentVersionId ?? "src"}-${index}`} className="border-b border-slate-100">
                        <td className="px-2 py-1">{source.documentId ?? "-"}</td>
                        <td className="px-2 py-1">{source.documentVersionId ?? "-"}</td>
                        <td className="px-2 py-1">{source.sourceType ?? "-"}</td>
                        <td className="px-2 py-1">{source.corpusDomain ?? "-"}</td>
                        <td className="px-2 py-1">{typeof source.score === "number" ? source.score.toFixed(4) : "-"}</td>
                        <td className="px-2 py-1">{source.rank ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PagePanel>
        </div>
      </div>
    </div>
  );
}

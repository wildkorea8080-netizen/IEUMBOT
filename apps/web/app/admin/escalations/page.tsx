"use client";

import { FormEvent, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import {
  createEscalationRule,
  deleteEscalationRule,
  getEscalationCaseDetail,
  listEscalationCases,
  listEscalationRules,
  patchEscalationRule,
} from "../../../lib/api/escalations";
import type {
  EscalationCaseDetail,
  EscalationCaseFilters,
  EscalationCaseSummary,
  EscalationOutcome,
  EscalationRule,
  EscalationTriggerType,
} from "../../../lib/api/escalations-types";

const triggerOptions: EscalationTriggerType[] = [
  "insufficient_evidence",
  "restricted_topic",
  "conflict_detected",
  "after_hours",
  "repeated_dissatisfaction",
  "manual_operator_review",
];

const outcomeOptions: Array<EscalationOutcome | "all"> = [
  "all",
  "answered",
  "insufficient_evidence",
  "restricted",
  "conflict",
  "escalate",
  "clarification",
];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

function formatDate(value: string | undefined | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

function outcomeBadgeClass(outcome?: string | null): string {
  if (outcome === "answered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (outcome === "insufficient_evidence") return "border-amber-200 bg-amber-50 text-amber-700";
  if (outcome === "restricted") return "border-red-200 bg-red-50 text-red-700";
  if (outcome === "conflict") return "border-orange-200 bg-orange-50 text-orange-700";
  if (outcome === "escalate") return "border-purple-200 bg-purple-50 text-purple-700";
  if (outcome === "clarification") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function compactObject(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "-";
  return entries
    .slice(0, 6)
    .map(([key, v]) => `${key}: ${String(v)}`)
    .join(" | ");
}

export default function EscalationsPage() {
  const [chatbotId, setChatbotId] = useState("");

  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [cases, setCases] = useState<EscalationCaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCaseDetail, setSelectedCaseDetail] = useState<EscalationCaseDetail | null>(null);

  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [newTriggerType, setNewTriggerType] = useState<EscalationTriggerType>("insufficient_evidence");
  const [newTargetDepartment, setNewTargetDepartment] = useState("");
  const [newTargetQueue, setNewTargetQueue] = useState("");
  const [newFallbackMessage, setNewFallbackMessage] = useState("");
  const [newPriority, setNewPriority] = useState(100);
  const [newIsActive, setNewIsActive] = useState(true);

  const [filterReason, setFilterReason] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterQueue, setFilterQueue] = useState("");
  const [filterOutcome, setFilterOutcome] = useState<EscalationOutcome | "all">("all");
  const [filterLlm, setFilterLlm] = useState<"all" | "executed" | "skipped">("all");
  const [filterUnresolvedOnly, setFilterUnresolvedOnly] = useState(true);
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const selectedCase = useMemo(() => {
    if (!selectedCaseId) return cases[0] ?? null;
    return cases.find((item) => item.messageId === selectedCaseId) ?? cases[0] ?? null;
  }, [cases, selectedCaseId]);

  async function loadRules(id: string) {
    setIsLoadingRules(true);
    try {
      const response = await listEscalationRules(id);
      setRules(response.rules);
    } finally {
      setIsLoadingRules(false);
    }
  }

  async function loadCases(id: string, filters: EscalationCaseFilters) {
    setIsLoadingCases(true);
    try {
      const response = await listEscalationCases(id, filters);
      setCases(response.items);
      if (response.items.length > 0) {
        const currentSelected = selectedCaseId
          ? response.items.find((item) => item.messageId === selectedCaseId)
          : null;
        const nextSelected = currentSelected ?? response.items[0];
        setSelectedCaseId(nextSelected.messageId);
        await loadCaseDetail(id, nextSelected.messageId);
      } else {
        setSelectedCaseId(null);
        setSelectedCaseDetail(null);
      }
    } finally {
      setIsLoadingCases(false);
    }
  }

  async function loadCaseDetail(id: string, messageId: string) {
    setIsLoadingDetail(true);
    try {
      const detail = await getEscalationCaseDetail(id, messageId);
      setSelectedCaseDetail(detail);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleLoadAll() {
    const id = chatbotId.trim();
    if (!id) {
      setErrorMessage("chatbot ID를 입력해 주세요.");
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      const filters: EscalationCaseFilters = {
        reason: filterReason.trim() || undefined,
        targetDepartment: filterDepartment.trim() || undefined,
        targetQueue: filterQueue.trim() || undefined,
        outcome: filterOutcome === "all" ? undefined : filterOutcome,
        llmExecuted:
          filterLlm === "all" ? undefined : filterLlm === "executed" ? true : false,
        unresolvedOnly: filterUnresolvedOnly,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined,
        limit: 100,
      };
      await Promise.all([loadRules(id), loadCases(id, filters)]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = chatbotId.trim();
    if (!id) {
      setErrorMessage("chatbot ID를 입력해 주세요.");
      return;
    }
    setIsSubmittingRule(true);
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      await createEscalationRule(id, {
        triggerType: newTriggerType,
        targetDepartment: newTargetDepartment.trim(),
        targetQueue: newTargetQueue.trim(),
        fallbackMessage: newFallbackMessage.trim() || undefined,
        priority: newPriority,
        isActive: newIsActive,
      });
      setFeedbackMessage("에스컬레이션 규칙이 등록되었습니다.");
      setNewTargetDepartment("");
      setNewTargetQueue("");
      setNewFallbackMessage("");
      await loadRules(id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmittingRule(false);
    }
  }

  async function handleToggleRule(rule: EscalationRule) {
    const id = chatbotId.trim();
    if (!id) return;
    setActionBusyKey(`rule:toggle:${rule.id}`);
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      await patchEscalationRule(id, rule.id, { isActive: !rule.isActive });
      setFeedbackMessage("규칙 상태를 변경했습니다.");
      await loadRules(id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleDeleteRule(ruleId: string) {
    const id = chatbotId.trim();
    if (!id) return;
    setActionBusyKey(`rule:delete:${ruleId}`);
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      await deleteEscalationRule(id, ruleId);
      setFeedbackMessage("규칙을 삭제했습니다.");
      await loadRules(id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleSelectCase(item: EscalationCaseSummary) {
    setSelectedCaseId(item.messageId);
    const id = chatbotId.trim();
    if (!id) return;
    setErrorMessage(null);
    try {
      await loadCaseDetail(id, item.messageId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <PagePanel
        title="에스컬레이션 관리"
        description="트리거 규칙을 관리하고 실제 에스컬레이션 케이스를 운영 관점에서 확인합니다."
      >
        <div className="grid gap-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="block text-xs text-slate-700 lg:col-span-2">
              chatbot ID
              <input
                value={chatbotId}
                onChange={(event) => setChatbotId(event.target.value)}
                placeholder="UUID"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleLoadAll}
                disabled={isLoadingRules || isLoadingCases}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {isLoadingRules || isLoadingCases ? "불러오는 중..." : "조회"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <input
              value={filterReason}
              onChange={(event) => setFilterReason(event.target.value)}
              placeholder="reason"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={filterDepartment}
              onChange={(event) => setFilterDepartment(event.target.value)}
              placeholder="department"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={filterQueue}
              onChange={(event) => setFilterQueue(event.target.value)}
              placeholder="queue"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={filterOutcome}
              onChange={(event) => setFilterOutcome(event.target.value as EscalationOutcome | "all")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {outcomeOptions.map((option) => (
                <option key={option} value={option}>
                  outcome: {option}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <select
              value={filterLlm}
              onChange={(event) => setFilterLlm(event.target.value as "all" | "executed" | "skipped")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">LLM 전체</option>
              <option value="executed">LLM 실행</option>
              <option value="skipped">LLM 스킵</option>
            </select>
            <label className="block text-xs text-slate-700">
              시작일
              <input
                type="date"
                value={filterFromDate}
                onChange={(event) => setFilterFromDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-700">
              종료일
              <input
                type="date"
                value={filterToDate}
                onChange={(event) => setFilterToDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={filterUnresolvedOnly}
                onChange={(event) => setFilterUnresolvedOnly(event.target.checked)}
              />
              미해결 항목만
            </label>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </p>
          ) : null}
          {feedbackMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {feedbackMessage}
            </p>
          ) : null}
        </div>
      </PagePanel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <PagePanel
          title="A. 에스컬레이션 규칙"
          description="트리거 조건별 부서/큐 라우팅과 메시지를 관리합니다."
        >
          <form onSubmit={handleCreateRule} className="grid gap-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">규칙 추가</p>
            <div className="grid gap-2 md:grid-cols-2">
              <select
                value={newTriggerType}
                onChange={(event) => setNewTriggerType(event.target.value as EscalationTriggerType)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                {triggerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                value={newPriority}
                onChange={(event) => setNewPriority(Number(event.target.value))}
                type="number"
                min={1}
                max={1000}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={newTargetDepartment}
                onChange={(event) => setNewTargetDepartment(event.target.value)}
                placeholder="targetDepartment"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
              <input
                value={newTargetQueue}
                onChange={(event) => setNewTargetQueue(event.target.value)}
                placeholder="targetQueue"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </div>
            <textarea
              value={newFallbackMessage}
              onChange={(event) => setNewFallbackMessage(event.target.value)}
              rows={2}
              placeholder="fallbackMessage (선택)"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newIsActive}
                onChange={(event) => setNewIsActive(event.target.checked)}
              />
              isActive
            </label>
            <div>
              <button
                type="submit"
                disabled={isSubmittingRule}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {isSubmittingRule ? "저장 중..." : "규칙 저장"}
              </button>
            </div>
          </form>

          <div className="mt-3 space-y-2">
            {isLoadingRules ? (
              <p className="text-xs text-slate-600">규칙을 불러오는 중...</p>
            ) : rules.length === 0 ? (
              <p className="text-xs text-slate-500">등록된 규칙이 없습니다.</p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="rounded-md border border-slate-200 p-3 text-xs text-slate-700">
                  <p className="font-medium text-slate-900">
                    {rule.triggerType} / {rule.targetDepartment}/{rule.targetQueue}
                  </p>
                  <p className="mt-1">
                    priority={rule.priority} | active={String(rule.isActive)}
                  </p>
                  <p className="mt-1">fallback: {rule.fallbackMessage ?? "-"}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule)}
                      disabled={actionBusyKey === `rule:toggle:${rule.id}`}
                      className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-60"
                    >
                      {rule.isActive ? "비활성화" : "활성화"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={actionBusyKey === `rule:delete:${rule.id}`}
                      className="rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </PagePanel>

        <div className="space-y-4">
          <PagePanel
            title="B. 에스컬레이션 케이스 목록"
            description="실제 응답 흐름에서 발생한 에스컬레이션 케이스를 필터링하고 확인합니다."
          >
            {isLoadingCases ? (
              <p className="text-sm text-slate-600">케이스 조회 중...</p>
            ) : cases.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                조회된 에스컬레이션 케이스가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {cases.map((item) => (
                  <li
                    key={item.messageId}
                    onClick={() => handleSelectCase(item)}
                    className={[
                      "cursor-pointer rounded-md border p-3 text-sm",
                      selectedCase?.messageId === item.messageId
                        ? "border-brand-300 bg-brand-50"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-xs ${outcomeBadgeClass(item.outcome)}`}>
                        {item.outcome ?? "unknown"}
                      </span>
                      <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                        {item.llmExecuted ? "LLM 실행" : "LLM 스킵"}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-slate-900">{item.latestUserQuestionPreview ?? "-"}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.escalationReason ?? "-"} | {item.escalationTargetDepartment ?? "-"}/
                      {item.escalationTargetQueue ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      session={item.sessionId} | {formatDate(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PagePanel>

          <PagePanel
            title="C. 에스컬레이션 상세"
            description="대화 요약, 정책 결정, 가드레일 매치, 인용, 대상 정보를 확인합니다."
          >
            {!selectedCase ? (
              <p className="text-sm text-slate-600">목록에서 케이스를 선택해 주세요.</p>
            ) : isLoadingDetail ? (
              <p className="text-sm text-slate-600">상세 정보를 불러오는 중...</p>
            ) : !selectedCaseDetail ? (
              <button
                type="button"
                onClick={() => handleSelectCase(selectedCase)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                상세 조회
              </button>
            ) : (
              <div className="space-y-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs ${outcomeBadgeClass(selectedCaseDetail.outcome)}`}>
                    {selectedCaseDetail.outcome ?? "unknown"}
                  </span>
                  <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                    {selectedCaseDetail.llmExecuted ? "LLM 실행" : "LLM 스킵"}
                  </span>
                </div>

                <p>reason: {selectedCaseDetail.escalationReason ?? "-"}</p>
                <p>
                  target: {selectedCaseDetail.escalationTargetDepartment ?? "-"} /{" "}
                  {selectedCaseDetail.escalationTargetQueue ?? "-"}
                </p>
                <p>created: {formatDate(selectedCaseDetail.createdAt)}</p>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-600">최신 사용자 질문</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-900">
                    {selectedCaseDetail.latestUserQuestion ?? "-"}
                  </p>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="font-semibold text-slate-600">최신 안내 메시지</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-900">
                    {selectedCaseDetail.assistantMessage ?? "-"}
                  </p>
                </div>

                <p>policyDecision: {compactObject(selectedCaseDetail.policyDecision)}</p>
                <p>matchedGuardrails: {selectedCaseDetail.matchedGuardrails.join(", ") || "-"}</p>
                <p>traceSummary: {compactObject(selectedCaseDetail.traceSummary)}</p>

                <div>
                  <p className="mb-1 font-semibold text-slate-600">citations</p>
                  {selectedCaseDetail.citations.length === 0 ? (
                    <p className="text-slate-500">-</p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedCaseDetail.citations.map((citation, index) => (
                        <li key={`${citation.documentVersionId ?? "c"}-${index}`}>
                          - {citation.title ?? "-"} / p={citation.pageNumber ?? "-"} / sec=
                          {citation.sectionTitle ?? "-"} / type={citation.sourceType ?? "-"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 font-semibold text-slate-600">conversation summary</p>
                  <ul className="space-y-1">
                    {selectedCaseDetail.conversationSummary.map((turn, index) => (
                      <li key={`${turn.createdAt}-${index}`}>
                        [{turn.role}] {turn.content}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </PagePanel>
        </div>
      </div>
    </div>
  );
}

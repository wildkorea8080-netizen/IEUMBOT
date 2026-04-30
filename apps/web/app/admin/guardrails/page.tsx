"use client";

import { FormEvent, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import {
  createGuardrail,
  deleteGuardrail,
  getGuardrails,
  patchGuardrail,
  type GuardrailRule,
  type GuardrailSeverity,
} from "../../../lib/api/guardrails";

const severityOptions: GuardrailSeverity[] = ["low", "medium", "high", "critical"];
const defaultFallbackMessage =
  "원활한 안내를 위해 정중한 표현으로 다시 말씀해 주세요. 업무 관련 질문은 계속 도와드릴 수 있습니다.";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "가드레일 요청 처리 중 오류가 발생했습니다.";
}

function severityBadgeClass(severity: GuardrailSeverity): string {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "high") return "bg-orange-100 text-orange-700";
  if (severity === "medium") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function severityPriority(severity: GuardrailSeverity): number {
  if (severity === "critical") return 10;
  if (severity === "high") return 20;
  if (severity === "medium") return 40;
  return 60;
}

function normalizePhrases(value: string): string[] {
  const unique = new Set<string>();
  for (const line of value.split(/\r?\n/)) {
    const phrase = line.trim();
    if (!phrase) continue;
    unique.add(phrase);
  }
  return Array.from(unique);
}

export default function GuardrailsPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [rules, setRules] = useState<GuardrailRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [phrase, setPhrase] = useState("");
  const [bulkPhrases, setBulkPhrases] = useState("");
  const [fallbackMessage, setFallbackMessage] = useState(defaultFallbackMessage);
  const [severity, setSeverity] = useState<GuardrailSeverity>("high");
  const [isActive, setIsActive] = useState(true);

  const forbiddenRules = useMemo(
    () => rules.filter((rule) => rule.ruleType === "forbidden_phrase"),
    [rules],
  );
  const otherRuleCount = useMemo(
    () => rules.filter((rule) => rule.ruleType !== "forbidden_phrase").length,
    [rules],
  );

  async function load() {
    const id = chatbotId.trim();
    if (!id) {
      setError("chatbot ID를 입력해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await getGuardrails(id);
      setRules(response.rules);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setEditingRuleId(null);
    setPhrase("");
    setSeverity("high");
    setIsActive(true);
    setFallbackMessage(defaultFallbackMessage);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = chatbotId.trim();
    if (!id) {
      setError("chatbot ID를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const body = {
        ruleType: "forbidden_phrase" as const,
        matchMode: "contains" as const,
        matchValue: phrase.trim(),
        actionType: "fallback" as const,
        severity,
        fallbackMessage: fallbackMessage.trim() || undefined,
        priority: severityPriority(severity),
        isActive,
        metadataJson: { dictionaryType: "blocked_expression" },
      };

      if (editingRuleId) {
        await patchGuardrail(id, editingRuleId, body);
        setFeedback("차단 표현을 수정했습니다.");
      } else {
        await createGuardrail(id, body);
        setFeedback("차단 표현을 추가했습니다.");
      }

      resetForm();
      await load();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkUpload() {
    const id = chatbotId.trim();
    if (!id) {
      setError("chatbot ID를 입력해 주세요.");
      return;
    }

    const normalized = normalizePhrases(bulkPhrases);
    if (normalized.length === 0) {
      setError("일괄 업로드할 표현을 한 줄에 하나씩 입력해 주세요.");
      return;
    }

    const existing = new Set(
      forbiddenRules
        .map((rule) => rule.matchValue?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value)),
    );
    const candidates = normalized.filter((item) => !existing.has(item.toLowerCase()));
    const skippedCount = normalized.length - candidates.length;

    setIsBulkSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      for (const value of candidates) {
        await createGuardrail(id, {
          ruleType: "forbidden_phrase",
          matchMode: "contains",
          matchValue: value,
          actionType: "fallback",
          severity,
          fallbackMessage: fallbackMessage.trim() || undefined,
          priority: severityPriority(severity),
          isActive,
          metadataJson: { dictionaryType: "blocked_expression", createdBy: "bulk_upload" },
        });
      }
      await load();
      setBulkPhrases("");
      setFeedback(`일괄 업로드 완료: ${candidates.length}건 추가, ${skippedCount}건 중복 제외`);
    } catch (bulkError) {
      setError(getErrorMessage(bulkError));
    } finally {
      setIsBulkSubmitting(false);
    }
  }

  function startEdit(rule: GuardrailRule) {
    setEditingRuleId(rule.id);
    setPhrase(rule.matchValue ?? "");
    setSeverity(rule.severity);
    setIsActive(rule.isActive);
    setFallbackMessage(rule.fallbackMessage ?? defaultFallbackMessage);
    setFeedback(null);
    setError(null);
  }

  async function handleToggle(rule: GuardrailRule) {
    const id = chatbotId.trim();
    if (!id) return;
    setError(null);
    setFeedback(null);
    try {
      await patchGuardrail(id, rule.id, { isActive: !rule.isActive });
      setFeedback("표현 활성 상태를 변경했습니다.");
      await load();
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    }
  }

  async function handleDelete(ruleId: string) {
    const id = chatbotId.trim();
    if (!id) return;
    setError(null);
    setFeedback(null);
    try {
      await deleteGuardrail(id, ruleId);
      if (editingRuleId === ruleId) {
        resetForm();
      }
      setFeedback("차단 표현을 삭제했습니다.");
      await load();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel
        title="차단 표현 사전"
        description="욕설, 공격적 표현, 금지 문구를 사전 형태로 관리하고 응답 메시지와 수위를 함께 설정합니다."
      >
        <div className="flex flex-wrap gap-3">
          <input
            value={chatbotId}
            onChange={(event) => setChatbotId(event.target.value)}
            placeholder="chatbot ID"
            className="w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            조회
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-600">차단 표현 수</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{forbiddenRules.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-600">활성 표현 수</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {forbiddenRules.filter((rule) => rule.isActive).length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-600">기타 가드레일 규칙</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{otherRuleCount}</p>
          </div>
        </div>
      </PagePanel>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <PagePanel
          title={editingRuleId ? "차단 표현 수정" : "차단 표현 추가"}
          description="개별 표현의 응답 메시지와 수위를 직접 관리합니다."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">표현</span>
              <input
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder="예: 씨발"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">수위</span>
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as GuardrailSeverity)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {severityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">차단 응답 메시지</span>
              <textarea
                value={fallbackMessage}
                onChange={(event) => setFallbackMessage(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              활성화
            </label>

            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {feedback ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSubmitting ? "저장 중..." : editingRuleId ? "수정 저장" : "표현 추가"}
              </button>
              {editingRuleId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  취소
                </button>
              ) : null}
            </div>
          </form>
        </PagePanel>

        <PagePanel
          title="차단 표현 일괄 업로드"
          description="한 줄에 하나씩 입력하면 중복을 제외하고 여러 표현을 한 번에 등록합니다."
        >
          <div className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">표현 목록</span>
              <textarea
                value={bulkPhrases}
                onChange={(event) => setBulkPhrases(event.target.value)}
                rows={10}
                placeholder={"예:\n씨발\n병신\n꺼져"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-slate-500">
              현재 설정된 수위, 안내 메시지, 활성 상태가 일괄 등록에도 동일하게 적용됩니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isBulkSubmitting}
                onClick={() => void handleBulkUpload()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isBulkSubmitting ? "업로드 중..." : "일괄 업로드"}
              </button>
            </div>
          </div>
        </PagePanel>
      </div>

      <PagePanel
        title="등록된 차단 표현"
        description="현재 챗봇에 적용되는 forbidden_phrase 규칙 목록입니다."
      >
        {isLoading ? <p className="text-sm text-slate-500">가드레일 규칙을 불러오는 중입니다.</p> : null}
        {!isLoading && forbiddenRules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            등록된 차단 표현이 없습니다.
          </div>
        ) : null}
        {forbiddenRules.length > 0 ? (
          <div className="space-y-3">
            {forbiddenRules.map((rule) => (
              <div key={rule.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-slate-900">{rule.matchValue}</strong>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${severityBadgeClass(rule.severity)}`}>
                        {rule.severity}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${rule.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                        {rule.isActive ? "active" : "inactive"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{rule.fallbackMessage ?? "-"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(rule)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggle(rule)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                    >
                      {rule.isActive ? "비활성화" : "활성화"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(rule.id)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}

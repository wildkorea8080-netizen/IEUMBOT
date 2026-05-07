"use client";

import type { SearchTestCandidate } from "../../lib/api/search-evidence-types";

type SearchResultsListProps = {
  candidates: SearchTestCandidate[];
  actionBusyKey: string | null;
  onExclude: (candidate: SearchTestCandidate) => Promise<void>;
  onBoost: (candidate: SearchTestCandidate) => Promise<void>;
  onPin: (candidate: SearchTestCandidate) => Promise<void>;
};

function formatScore(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(4);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ko-KR");
}

function renderMapSummary(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "-";
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return "-";
  }
  return entries
    .slice(0, 4)
    .map(([key, entryValue]) => `${key}: ${String(entryValue)}`)
    .join(" | ");
}

function renderList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return "-";
  }
  return value.map((item) => String(item)).join(", ");
}

export function SearchResultsList({
  candidates,
  actionBusyKey,
  onExclude,
  onBoost,
  onPin,
}: SearchResultsListProps) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        검색 결과가 없습니다. 필터를 완화하거나 질문을 구체화해 다시 실행하세요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => {
        const candidateKey = `${candidate.documentVersionId}-${candidate.finalRank}`;
        const isExcludeBusy = actionBusyKey === `exclude:${candidateKey}`;
        const isBoostBusy = actionBusyKey === `boost:${candidateKey}`;
        const isPinBusy = actionBusyKey === `pin:${candidateKey}`;

        return (
          <article key={candidateKey} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  #{candidate.finalRank} {candidate.documentName}
                </p>
                <p className="text-xs text-slate-600">
                  버전 {candidate.versionLabel ?? "-"} | 소스 {candidate.sourceType} | 코퍼스{" "}
                  {candidate.corpusDomain}
                </p>
                <p className="text-xs text-slate-600">
                  페이지 {candidate.pageNumber ?? "-"} | 섹션 {candidate.sectionTitle ?? "-"}
                </p>
                <p className="text-xs text-slate-600">
                  시행일 {formatDate(candidate.effectiveDate)} | 종료일 {formatDate(candidate.expirationDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onExclude(candidate)}
                  disabled={isExcludeBusy}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {isExcludeBusy ? "처리 중..." : "제외"}
                </button>
                <button
                  type="button"
                  onClick={() => onBoost(candidate)}
                  disabled={isBoostBusy}
                  className="rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                >
                  {isBoostBusy ? "처리 중..." : "부스트"}
                </button>
                <button
                  type="button"
                  onClick={() => onPin(candidate)}
                  disabled={isPinBusy}
                  className="rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                >
                  {isPinBusy ? "처리 중..." : "핀 고정"}
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3">
              <p>keywordScore: {formatScore(candidate.keywordScore)}</p>
              <p>vectorScore: {formatScore(candidate.vectorScore ?? undefined)}</p>
              <p>combinedScore: {formatScore(candidate.combinedScore)}</p>
            </div>

            <div className="mt-3 grid gap-3 text-xs text-slate-700 lg:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">룰 적용 요약</p>
                <p className="mt-1">selectedByRules: {renderMapSummary(candidate.selectedByRules)}</p>
                <p className="mt-1">
                  exclusionOrBoostApplied: {renderMapSummary(candidate.exclusionOrBoostApplied)}
                </p>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">구조화 설명</p>
                <p className="mt-1">
                  matchedKeywords: {renderList(candidate.explanation?.matchedKeywords)}
                </p>
                <p className="mt-1">
                  semanticRelevance: {renderMapSummary(candidate.explanation?.semanticRelevance)}
                </p>
                <p className="mt-1">
                  corpusPriorityApplied: {renderMapSummary(candidate.explanation?.corpusPriorityApplied)}
                </p>
                <p className="mt-1">
                  documentVersionPriorityApplied:{" "}
                  {renderMapSummary(candidate.explanation?.documentVersionPriorityApplied)}
                </p>
                <p className="mt-1">
                  recency/effective-date:{" "}
                  {renderMapSummary(candidate.explanation?.recencyEffectiveDateSignalApplied)}
                </p>
                <p className="mt-1">
                  manualRuleApplied: {renderMapSummary(candidate.explanation?.manualRuleApplied)}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

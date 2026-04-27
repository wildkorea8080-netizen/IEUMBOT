"use client";

import { FormEvent, useMemo, useState } from "react";

import { SearchResultsList } from "../../../components/search-evidence/search-results-list";
import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import {
  createBoostRule,
  createExcludeRule,
  createPinRule,
  createSynonymRule,
  deleteSearchRule,
  deleteSynonymRule,
  listSearchRules,
  runAdminSearchTest,
  updateSearchRule,
  updateSynonymRule,
} from "../../../lib/api/search-evidence";
import type {
  AdminSearchTestRequest,
  AdminSearchTestResponse,
  SearchRuleResponse,
  SearchRulesListResponse,
  SearchTestCandidate,
  SourceType,
  SynonymResponse,
} from "../../../lib/api/search-evidence-types";

function parseCommaSeparated(value: string): string[] | undefined {
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}

function compactObjectPreview(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "-";
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return "-";
  }
  return entries
    .slice(0, 5)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" | ");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function SearchEvidencePage() {
  const [chatbotId, setChatbotId] = useState("");
  const [question, setQuestion] = useState("");
  const [corpusDomainsInput, setCorpusDomainsInput] = useState("");
  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [topK, setTopK] = useState(10);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<AdminSearchTestResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<AdminSearchTestRequest | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [rulesData, setRulesData] = useState<SearchRulesListResponse | null>(null);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const [synCanonical, setSynCanonical] = useState("");
  const [synEquivalent, setSynEquivalent] = useState("");
  const [synScope, setSynScope] = useState("global");
  const [synBidirectional, setSynBidirectional] = useState(true);

  const hasSearchResult = Boolean(searchResult && searchResult.candidates.length > 0);

  const selectedSourceTypeSet = useMemo(() => new Set(sourceTypes), [sourceTypes]);

  const loadRules = async (id: string) => {
    setIsLoadingRules(true);
    setRulesError(null);
    try {
      const data = await listSearchRules(id);
      setRulesData(data);
    } catch (error) {
      setRulesError(getErrorMessage(error));
    } finally {
      setIsLoadingRules(false);
    }
  };

  const executeSearch = async (request: AdminSearchTestRequest) => {
    if (!chatbotId.trim()) {
      setSearchError("챗봇 ID를 입력하세요.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setFeedbackMessage(null);
    setFeedbackError(null);
    try {
      const response = await runAdminSearchTest(chatbotId.trim(), request);
      setSearchResult(response);
      setLastRequest(request);
      await loadRules(chatbotId.trim());
    } catch (error) {
      setSearchError(getErrorMessage(error));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request: AdminSearchTestRequest = {
      question,
      corpusDomains: parseCommaSeparated(corpusDomainsInput),
      sourceTypes: sourceTypes.length > 0 ? sourceTypes : undefined,
      topK,
      includeInactive,
    };
    await executeSearch(request);
  };

  const handleRuleAction = async (
    busyKey: string,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    setActionBusyKey(busyKey);
    setFeedbackMessage(null);
    setFeedbackError(null);
    try {
      await action();
      setFeedbackMessage(successMessage);
      if (chatbotId.trim()) {
        await loadRules(chatbotId.trim());
      }
      if (lastRequest) {
        await executeSearch(lastRequest);
      }
    } catch (error) {
      setFeedbackError(getErrorMessage(error));
    } finally {
      setActionBusyKey(null);
    }
  };

  const handleExclude = async (candidate: SearchTestCandidate) =>
    handleRuleAction(
      `exclude:${candidate.documentVersionId}-${candidate.finalRank}`,
      async () => {
        await createExcludeRule(chatbotId.trim(), {
          targetType: "documentVersion",
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
          reason: "관리자 검색 테스트 화면에서 수동 제외",
          isActive: true,
        });
      },
      "제외 룰이 저장되었습니다.",
    );

  const handleBoost = async (candidate: SearchTestCandidate) =>
    handleRuleAction(
      `boost:${candidate.documentVersionId}-${candidate.finalRank}`,
      async () => {
        await createBoostRule(chatbotId.trim(), {
          targetType: "documentVersion",
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
          boostValue: 20,
          reason: "관리자 검색 테스트 화면에서 수동 부스트",
          isActive: true,
        });
      },
      "부스트 룰이 저장되었습니다.",
    );

  const handlePin = async (candidate: SearchTestCandidate) =>
    handleRuleAction(
      `pin:${candidate.documentVersionId}-${candidate.finalRank}`,
      async () => {
        await createPinRule(chatbotId.trim(), {
          targetType: "documentVersion",
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
          queryPattern: question.trim() || candidate.documentName,
          reason: "관리자 검색 테스트 화면에서 수동 핀 고정",
          isActive: true,
        });
      },
      "핀 룰이 저장되었습니다.",
    );

  const handleAddSynonym = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleRuleAction(
      "synonym:create",
      async () => {
        await createSynonymRule(chatbotId.trim(), {
          canonicalTerm: synCanonical.trim(),
          synonymTerm: synEquivalent.trim(),
          isBidirectional: synBidirectional,
          scope: synScope,
          isActive: true,
        });
        setSynCanonical("");
        setSynEquivalent("");
      },
      "동의어 매핑이 추가되었습니다.",
    );
  };

  return (
    <div className="space-y-4">
      <PagePanel
        title="검색·근거 제어"
        description="검색 후보 선정 근거를 점검하고 제외/부스트/핀/동의어 룰을 운영자가 직접 제어합니다."
      >
        <form className="grid gap-3" onSubmit={handleSearchSubmit}>
          <label className="block text-xs text-slate-700">
            챗봇 ID
            <input
              value={chatbotId}
              onChange={(event) => setChatbotId(event.target.value)}
              placeholder="UUID 형식 챗봇 ID"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="block text-xs text-slate-700">
            질문
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="질문을 입력하고 검색 테스트를 실행하세요."
              rows={4}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-700">
              corpusDomains (쉼표 구분)
              <input
                value={corpusDomainsInput}
                onChange={(event) => setCorpusDomainsInput(event.target.value)}
                placeholder="policy, notice, procedure, faq, contact"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-700">
              topK
              <input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(event) => setTopK(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <span>sourceTypes:</span>
            {(["pdf", "web", "notice"] as SourceType[]).map((sourceType) => {
              const checked = selectedSourceTypeSet.has(sourceType);
              return (
                <label key={sourceType} className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSourceTypes((prev) => [...prev, sourceType]);
                      } else {
                        setSourceTypes((prev) => prev.filter((item) => item !== sourceType));
                      }
                    }}
                  />
                  {sourceType}
                </label>
              );
            })}
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              includeInactive
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSearching}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isSearching ? "검색 실행 중..." : "검색 테스트 실행"}
            </button>
            {lastRequest ? (
              <button
                type="button"
                disabled={isSearching}
                onClick={() => executeSearch(lastRequest)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                마지막 조건으로 재실행
              </button>
            ) : null}
          </div>

          {searchError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {searchError}
            </p>
          ) : null}
        </form>
      </PagePanel>

      <PagePanel
        title="검색 결과"
        description="랭킹 데이터, 구조화 설명, 수동 제어 액션을 분리해 확인합니다."
      >
        {!searchResult ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            질문을 입력하고 검색 테스트를 실행하세요.
          </div>
        ) : (
          <SearchResultsList
            candidates={searchResult.candidates ?? []}
            actionBusyKey={actionBusyKey}
            onExclude={handleExclude}
            onBoost={handleBoost}
            onPin={handlePin}
          />
        )}
      </PagePanel>

      <PagePanel title="검색 추적 요약" description="요청/정규화/확장/룰 적용/최종 순위를 요약합니다.">
        {searchResult?.trace ? (
          <div className="space-y-2 text-xs text-slate-700">
            <p>originalQuestion: {searchResult.trace.originalQuestion ?? "-"}</p>
            <p>normalizedQuestion: {searchResult.trace.normalizedQuestion ?? "-"}</p>
            <p>
              expandedTerms: {(searchResult.trace.expandedTerms ?? []).join(", ") || "-"}
            </p>
            <p>filters: {compactObjectPreview(searchResult.trace.appliedFilters)}</p>
            <p>appliedRules: {compactObjectPreview(searchResult.trace.appliedRules)}</p>
            <p>rankingOrder: {compactObjectPreview(searchResult.trace.rankingOrder?.[0])}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">검색 테스트 실행 후 추적 요약이 표시됩니다.</p>
        )}
      </PagePanel>

      <PagePanel title="룰·동의어 관리" description="현재 등록된 룰/동의어를 확인하고 활성 상태를 제어합니다.">
        <div className="space-y-3">
          <form className="grid gap-2 rounded-md border border-slate-200 p-3" onSubmit={handleAddSynonym}>
            <p className="text-sm font-semibold text-slate-900">동의어 매핑 추가</p>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                value={synCanonical}
                onChange={(event) => setSynCanonical(event.target.value)}
                placeholder="대표어 (예: 지원금)"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
              <input
                value={synEquivalent}
                onChange={(event) => setSynEquivalent(event.target.value)}
                placeholder="동의어 (예: 보조금)"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
              <input
                value={synScope}
                onChange={(event) => setSynScope(event.target.value)}
                placeholder="scope (예: global)"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={synBidirectional}
                onChange={(event) => setSynBidirectional(event.target.checked)}
              />
              양방향 동의어
            </label>
            <div>
              <button
                type="submit"
                disabled={actionBusyKey === "synonym:create"}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {actionBusyKey === "synonym:create" ? "추가 중..." : "동의어 추가"}
              </button>
            </div>
          </form>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">등록 룰 / 동의어</p>
              <button
                type="button"
                disabled={!chatbotId.trim() || isLoadingRules}
                onClick={() => loadRules(chatbotId.trim())}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                새로고침
              </button>
            </div>

            {isLoadingRules ? <p className="text-xs text-slate-600">불러오는 중...</p> : null}
            {rulesError ? <p className="text-xs text-red-700">{rulesError}</p> : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">검색 룰</p>
                {(rulesData?.rules ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">등록된 룰이 없습니다.</p>
                ) : (
                  (rulesData?.rules ?? []).map((rule: SearchRuleResponse) => (
                    <div key={rule.id} className="rounded border border-slate-200 p-2 text-xs text-slate-700">
                      <p className="font-medium text-slate-900">
                        {rule.ruleType} / {rule.targetType}
                      </p>
                      <p className="mt-1">
                        대상: {rule.documentVersionId ?? rule.documentId ?? rule.corpusDomain ?? rule.sourceType ?? "-"}
                      </p>
                      <p className="mt-1">이유: {rule.reason ?? "-"}</p>
                      <p className="mt-1">활성: {String(rule.isActive)}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleRuleAction(
                              `rule:toggle:${rule.id}`,
                              async () => {
                                await updateSearchRule(chatbotId.trim(), rule.id, {
                                  isActive: !rule.isActive,
                                });
                              },
                              "룰 상태가 변경되었습니다.",
                            )
                          }
                          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                        >
                          {rule.isActive ? "비활성화" : "활성화"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleRuleAction(
                              `rule:delete:${rule.id}`,
                              async () => {
                                await deleteSearchRule(chatbotId.trim(), rule.id);
                              },
                              "룰이 삭제되었습니다.",
                            )
                          }
                          className="rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">동의어 매핑</p>
                {(rulesData?.synonyms ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">등록된 동의어가 없습니다.</p>
                ) : (
                  (rulesData?.synonyms ?? []).map((synonym: SynonymResponse) => (
                    <div key={synonym.id} className="rounded border border-slate-200 p-2 text-xs text-slate-700">
                      <p className="font-medium text-slate-900">
                        {synonym.canonicalTerm} ↔ {synonym.synonymTerm}
                      </p>
                      <p className="mt-1">scope: {synonym.scope}</p>
                      <p className="mt-1">활성: {String(synonym.isActive)}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleRuleAction(
                              `synonym:toggle:${synonym.id}`,
                              async () => {
                                await updateSynonymRule(chatbotId.trim(), synonym.id, {
                                  isActive: !synonym.isActive,
                                });
                              },
                              "동의어 상태가 변경되었습니다.",
                            )
                          }
                          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                        >
                          {synonym.isActive ? "비활성화" : "활성화"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleRuleAction(
                              `synonym:delete:${synonym.id}`,
                              async () => {
                                await deleteSynonymRule(chatbotId.trim(), synonym.id);
                              },
                              "동의어가 삭제되었습니다.",
                            )
                          }
                          className="rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {feedbackMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {feedbackMessage}
            </p>
          ) : null}
          {feedbackError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {feedbackError}
            </p>
          ) : null}
          {!hasSearchResult && !searchError ? (
            <p className="text-xs text-slate-500">
              검색 테스트 결과가 없는 상태에서도 룰/동의어는 사전 등록할 수 있습니다.
            </p>
          ) : null}
        </div>
      </PagePanel>
    </div>
  );
}

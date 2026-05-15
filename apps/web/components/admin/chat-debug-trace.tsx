import type { ChatRuntimeTrace } from "../../lib/api/runtime-chat-types";

function formatScore(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "-";
}

function fallbackDescription(reason?: string): string {
  if (reason === "NO_KNOWLEDGE") return "답변에 사용할 수 있는 지식 근거가 부족합니다.";
  if (reason === "NO_RETRIEVAL_RESULT") return "검색된 지식이 없습니다. 관련 정책문서, 운영가이드 또는 FAQ를 추가해 주세요.";
  if (reason === "LOW_RETRIEVAL_SCORE") return "검색된 지식의 관련도가 낮습니다. 문서를 보강하거나 질문을 더 구체화해 주세요.";
  if (reason === "POLICY_BLOCKED") return "정책 또는 가드레일에 의해 답변이 제한되었습니다.";
  if (reason === "OUT_OF_SCOPE") return "챗봇의 답변 범위를 벗어난 질문입니다.";
  if (reason === "LLM_ERROR") return "모델 호출 중 오류가 발생했습니다.";
  if (reason === "NONE") return "fallback이 발생하지 않았습니다.";
  return "fallback 사유를 특정하지 못했습니다.";
}

function renderJson(value: unknown): string {
  if (!value) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ChatDebugTrace({ trace }: { trace?: ChatRuntimeTrace | null }) {
  if (!trace) return null;

  const retrieval = trace.retrieval;
  const chunks = retrieval?.chunks ?? [];
  const topScore = retrieval?.topScore;
  const scopeDiagnostics = retrieval?.scopeDiagnostics;
  const excludedChunkCountByReason =
    retrieval?.excludedChunkCountByReason ?? scopeDiagnostics?.excludedChunkCountByReason ?? {};

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <span className="font-semibold text-slate-900">messageType</span>: {trace.messageType ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">fallbackReason</span>: {trace.fallbackReason ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">latencyMs</span>: {trace.latencyMs ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">retrievedCount</span>: {retrieval?.retrievedCount ?? 0}
        </div>
        <div>
          <span className="font-semibold text-slate-900">usedInPromptCount</span>:{" "}
          {retrieval?.usedInPromptCount ?? 0}
        </div>
        <div>
          <span className="font-semibold text-slate-900">topScore</span>: {formatScore(topScore)}
        </div>
        <div>
          <span className="font-semibold text-slate-900">threshold</span>: {formatScore(retrieval?.threshold)}
        </div>
        <div>
          <span className="font-semibold text-slate-900">dynamicThreshold</span>:{" "}
          {formatScore(retrieval?.dynamicThreshold)}
        </div>
        <div>
          <span className="font-semibold text-slate-900">promptChunkCount</span>:{" "}
          {retrieval?.promptChunkCount ?? retrieval?.usedInPromptCount ?? 0}
        </div>
        <div>
          <span className="font-semibold text-slate-900">searchableChunkCount</span>:{" "}
          {retrieval?.searchableChunkCount ?? scopeDiagnostics?.searchableChunkCount ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">sourceDiversityApplied</span>:{" "}
          {retrieval?.sourceDiversityApplied ? "true" : "false"}
        </div>
        <div className="break-all">
          <span className="font-semibold text-slate-900">filterScope</span>:{" "}
          {retrieval?.filterScope?.organizationId ?? "-"} / {retrieval?.filterScope?.chatbotId ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">model</span>: {trace.model?.name ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">llm.executed</span>:{" "}
          {trace.llm?.executed ?? trace.model?.executed ? "true" : "false"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">llm.errorCode</span>:{" "}
          {trace.llm?.errorCode ?? trace.model?.errorCode ?? "-"}
        </div>
        <div>
          <span className="font-semibold text-slate-900">exceptionType</span>:{" "}
          {trace.exceptionType ?? trace.llm?.exceptionType ?? "-"}
        </div>
      </div>

      {trace.exceptionMessage ?? trace.llm?.exceptionMessage ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-rose-800">
          {trace.exceptionMessage ?? trace.llm?.exceptionMessage}
        </p>
      ) : null}

      {trace.fallbackReason && trace.fallbackReason !== "NONE" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-800">
          fallbackReason: {trace.fallbackReason} - {fallbackDescription(trace.fallbackReason)}
        </p>
      ) : null}

      {retrieval?.retrievedCount === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-2">
          검색된 지식이 없습니다. 관련 정책문서, 운영가이드 또는 FAQ를 추가해 주세요.
        </p>
      ) : null}
      {typeof topScore === "number" && typeof retrieval?.threshold === "number" && topScore < retrieval.threshold ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-800">
          검색된 지식의 관련도가 낮습니다. 문서를 보강하거나 질문을 더 구체화해 주세요.
        </p>
      ) : null}

      {scopeDiagnostics ? (
        <details className="rounded-md border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer font-semibold text-slate-900">scopeDiagnostics</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <span className="font-semibold">matchedOrganizationId</span>:{" "}
              {scopeDiagnostics.matchedOrganizationId ?? "-"}
            </div>
            <div>
              <span className="font-semibold">matchedChatbotId</span>:{" "}
              {scopeDiagnostics.matchedChatbotId ?? "-"}
            </div>
            <div>
              <span className="font-semibold">totalChunkCount</span>: {scopeDiagnostics.totalChunkCount ?? "-"}
            </div>
            <div>
              <span className="font-semibold">searchableChunkCount</span>:{" "}
              {scopeDiagnostics.searchableChunkCount ?? "-"}
            </div>
          </div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-slate-600">
            excludedChunkCountByReason: {renderJson(excludedChunkCountByReason)}
          </pre>
        </details>
      ) : null}

      <div>
        <p className="mb-2 font-semibold text-slate-900">검색된 chunk</p>
        {chunks.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-3 text-slate-500">
            표시할 chunk가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {chunks.map((chunk, index) => (
              <li key={`${chunk.chunkId ?? "chunk"}-${index}`} className="rounded-md border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{chunk.sourceTitle ?? "제목 없음"}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">{chunk.sourceType ?? "-"}</span>
                  {chunk.usedInPrompt ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">usedInPrompt</span>
                  ) : null}
                  {chunk.thresholdPassed ? (
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-700">threshold pass</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">below threshold</span>
                  )}
                </div>
                <p className="mt-1 break-all text-slate-500">{chunk.sourceUrl ?? chunk.fileName ?? "-"}</p>
                <p className="mt-1">
                  score {formatScore(chunk.score)} | vector {formatScore(chunk.vectorScore)} | lexical{" "}
                  {formatScore(chunk.lexicalScore)} | dynamicThreshold {formatScore(chunk.dynamicThreshold)}
                </p>
                {(chunk.matchedKeywords ?? []).length > 0 ? (
                  <p className="mt-1 text-slate-500">matchedKeywords: {(chunk.matchedKeywords ?? []).join(", ")}</p>
                ) : null}
                {chunk.semanticRescued || chunk.overviewRescued ? (
                  <p className="mt-1 text-emerald-700">
                    rescued: {chunk.semanticRescued ? "semantic " : ""}
                    {chunk.overviewRescued ? "overview" : ""}
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-slate-700">{chunk.preview ?? "-"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-md border border-slate-200 bg-white p-2">
        <summary className="cursor-pointer font-semibold text-slate-900">policyDecision</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-slate-600">
          {renderJson(trace.policyDecision)}
        </pre>
      </details>

      <details className="rounded-md border border-slate-200 bg-white p-2">
        <summary className="cursor-pointer font-semibold text-slate-900">prompt/context preview</summary>
        <div className="mt-2 space-y-2">
          <div>
            <p className="font-semibold">systemPreview</p>
            <p className="whitespace-pre-wrap text-slate-600">{trace.prompt?.systemPreview ?? "-"}</p>
          </div>
          <div>
            <p className="font-semibold">contextPreview</p>
            <p className="whitespace-pre-wrap text-slate-600">{trace.prompt?.contextPreview ?? "-"}</p>
          </div>
        </div>
      </details>
    </div>
  );
}

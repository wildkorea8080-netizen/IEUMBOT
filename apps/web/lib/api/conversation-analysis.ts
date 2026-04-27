import { apiClient } from "./client";
import type {
  CitationSummary,
  ConversationOutcome,
  ConversationTraceItem,
  ConversationTraceResponse,
  RetrievalSourceSummary,
} from "./conversation-analysis-types";

type RawRecord = Record<string, unknown>;

function asObject(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as RawRecord;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeOutcome(value: unknown): ConversationOutcome {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "answered") return "answered";
  if (raw === "insufficient_evidence") return "insufficient_evidence";
  if (raw === "restricted") return "restricted";
  if (raw === "conflict") return "conflict";
  if (raw === "escalate") return "escalate";
  if (raw === "clarification" || raw === "ask_clarification") return "clarification";
  return "unknown";
}

function mapRetrievalSummary(value: unknown): RetrievalSourceSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): RetrievalSourceSummary | null => {
      const row = asObject(item);
      if (!row) return null;

      return {
        documentId: asString(row.documentId) ?? "",
        documentVersionId: asString(row.documentVersionId) ?? "",
        rank: asNumber(row.rank) ?? 0,
        score: asNumber(row.score) ?? 0,
        sourceType: asString(row.sourceType) ?? "",
        corpusDomain: asString(row.corpusDomain) ?? "",
      };
    })
    .filter((item): item is RetrievalSourceSummary => item !== null);
}

function mapCitationSummary(value: unknown): CitationSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): CitationSummary | null => {
      const row = asObject(item);
      if (!row) return null;

      return {
        documentId: asString(row.documentId) ?? "",
        documentVersionId: asString(row.documentVersionId) ?? "",
        pageNumber: asNumber(row.pageNumber) ?? 0,
        sectionTitle: asString(row.sectionTitle) ?? "",
        rank: asNumber(row.rank) ?? 0,
      };
    })
    .filter((item): item is CitationSummary => item !== null);
}

function mapItem(raw: unknown): ConversationTraceItem | null {
  const row = asObject(raw);
  if (!row) {
    return null;
  }
  const metadata = asObject(row.metadataJson ?? row.metadata_json) ?? {};
  const trace = asObject(metadata.trace ?? row.trace) ?? {};
  const requestId = asString(row.requestId ?? row.request_id ?? metadata.requestId) ?? "";
  if (!requestId) {
    return null;
  }

  const createdAt =
    asString(row.createdAt ?? row.created_at ?? metadata.createdAt) ?? new Date().toISOString();

  return {
    id: asString(row.id) ?? requestId,
    requestId,
    chatbotId: asString(row.chatbotId ?? row.chatbot_id ?? row.targetId ?? row.target_id),
    sessionId: asString(trace.sessionId ?? trace.session_id),
    createdAt,
    updatedAt: asString(row.updatedAt ?? row.updated_at),
    question: asString(metadata.question ?? trace.question),
    answer: asString(metadata.answer ?? trace.answer),
    outcome: normalizeOutcome(metadata.outcome ?? trace.outcome),
    llmExecuted: asBoolean(metadata.llmExecuted ?? trace.llmExecuted),
    llmErrorCode: asString(metadata.llmErrorCode ?? trace.llmErrorCode),
    policyDecision: asString(metadata.policyDecision ?? trace.policyDecision),
    policyReason: asString(metadata.reason ?? trace.reason),
    flags: asObject(metadata.flags ?? trace.flags) ?? undefined,
    guardrailMatchedRuleIds:
      (Array.isArray(metadata.guardrailMatchedRuleIds)
        ? metadata.guardrailMatchedRuleIds
        : trace.guardrailMatchedRuleIds) as string[] | undefined,
    guardrailFinalAction: asString(metadata.guardrailFinalAction ?? trace.guardrailFinalAction),
    retrievalSummary: mapRetrievalSummary(metadata.retrievalSummary ?? trace.retrievalSummary),
    citationSummary: mapCitationSummary(metadata.citationSummary ?? trace.citationSummary),
    effectiveSettingsSummary:
      asObject(metadata.effectiveSettingsSummary ?? trace.effectiveSettingsSummary) ?? undefined,
    rawTrace: trace,
  };
}

export async function listConversationTraces(): Promise<ConversationTraceResponse> {
  const payload = await apiClient.request<unknown>("/admin/logs/chat");
  let rows: unknown[] = [];
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (payload && typeof payload === "object") {
    const objectPayload = payload as RawRecord;
    if (Array.isArray(objectPayload.items)) {
      rows = objectPayload.items;
    } else if (Array.isArray(objectPayload.logs)) {
      rows = objectPayload.logs;
    } else if (Array.isArray(objectPayload.data)) {
      rows = objectPayload.data;
    }
  }

  const items = rows
    .map(mapItem)
    .filter((item): item is ConversationTraceItem => item !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return { items };
}

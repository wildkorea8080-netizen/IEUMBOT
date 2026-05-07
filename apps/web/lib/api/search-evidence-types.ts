export type SourceType = "pdf" | "web" | "notice";
export type RuleType = "exclude" | "boost" | "pin";
export type RuleTargetType =
  | "document"
  | "documentVersion"
  | "corpus"
  | "sourceType"
  | "query";

export type AdminSearchTestRequest = {
  question: string;
  corpusDomains?: string[];
  sourceTypes?: SourceType[];
  topK?: number;
  includeInactive?: boolean;
};

export type RuleEffectSummary = {
  excluded?: boolean;
  boosted?: boolean;
  pinned?: boolean;
  boostValue?: number;
  reason?: string | null;
};

export type RetrievalExplanation = {
  matchedKeywords?: string[];
  semanticRelevance?: Record<string, unknown>;
  corpusPriorityApplied?: Record<string, unknown>;
  documentVersionPriorityApplied?: Record<string, unknown>;
  recencyEffectiveDateSignalApplied?: Record<string, unknown>;
  manualRuleApplied?: RuleEffectSummary;
};

export type SearchTestCandidate = {
  documentId: string;
  documentName: string;
  documentVersionId: string;
  versionLabel?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  corpusDomain: string;
  sourceType: string;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  keywordScore: number;
  vectorScore: number | null;
  combinedScore: number;
  finalRank: number;
  selectedByRules?: Record<string, unknown>;
  exclusionOrBoostApplied?: Record<string, unknown>;
  explanation?: RetrievalExplanation;
};

export type AdminSearchTestTrace = {
  originalQuestion?: string;
  normalizedQuestion?: string;
  expandedTerms?: string[];
  appliedFilters?: Record<string, unknown>;
  appliedRules?: Record<string, unknown>;
  rankingOrder?: Array<Record<string, unknown>>;
};

export type AdminSearchTestResponse = {
  requestId: string;
  chatbotId: string;
  candidates: SearchTestCandidate[];
  trace?: AdminSearchTestTrace;
};

export type SearchRuleBase = {
  targetType: RuleTargetType;
  documentId?: string;
  documentVersionId?: string;
  corpusDomain?: string;
  sourceType?: SourceType;
  queryPattern?: string;
  reason?: string;
  isActive?: boolean;
  metadataJson?: Record<string, unknown>;
};

export type CreateExcludeRuleRequest = SearchRuleBase;

export type CreateBoostRuleRequest = SearchRuleBase & {
  boostValue: number;
};

export type CreatePinRuleRequest = SearchRuleBase & {
  queryPattern: string;
};

export type SearchRuleResponse = {
  id: string;
  chatbotId: string;
  ruleType: RuleType;
  targetType: string;
  documentId?: string | null;
  documentVersionId?: string | null;
  corpusDomain?: string | null;
  sourceType?: string | null;
  queryPattern?: string | null;
  boostValue?: number | null;
  reason?: string | null;
  isActive: boolean;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UpdateSearchRuleRequest = {
  isActive?: boolean;
  reason?: string;
  boostValue?: number;
  queryPattern?: string;
  metadataJson?: Record<string, unknown>;
};

export type SynonymRequest = {
  canonicalTerm: string;
  synonymTerm: string;
  isBidirectional?: boolean;
  scope?: string;
  notes?: string;
  isActive?: boolean;
};

export type SynonymUpdateRequest = {
  isActive?: boolean;
  isBidirectional?: boolean;
  scope?: string;
  notes?: string;
};

export type SynonymResponse = {
  id: string;
  chatbotId?: string | null;
  canonicalTerm: string;
  synonymTerm: string;
  isBidirectional: boolean;
  scope: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SearchRulesListResponse = {
  rules: SearchRuleResponse[];
  synonyms: SynonymResponse[];
};

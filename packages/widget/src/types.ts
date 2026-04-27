export type WidgetQuickAction = {
  id: string;
  label: string;
  actionType: "question" | "link" | string;
  payload?: string | null;
  url?: string | null;
  displayLocation: string;
  sortOrder: number;
};

export type WidgetPublicConfig = {
  chatbotId: string;
  chatbotName: string;
  welcomeMessage: string;
  privacyNotice?: string | null;
  citationMode: string;
  theme: {
    primaryColor?: string | null;
    textColor?: string | null;
    backgroundColor?: string | null;
  };
  quickActions: WidgetQuickAction[];
  operatingHours: {
    isAfterHours: boolean;
    message?: string | null;
  };
  runtime: {
    chatEndpoint: string;
    chatStreamEndpoint?: string;
    streamingMode: string;
    sseEnabled?: boolean;
  };
};

export type WidgetInitOptions = {
  chatbotId: string;
  apiBaseUrl?: string;
  launcherLabel?: string;
  title?: string;
  welcomeMessage?: string;
  openOnLoad?: boolean;
  topK?: number;
  sourceUrl?: string;
  theme?: {
    primaryColor?: string;
    textColor?: string;
    backgroundColor?: string;
  };
};

export type ChatRequest = {
  chatbotId: string;
  question: string;
  topK?: number;
  sessionToken?: string;
  sourceUrl?: string;
};

export type ChatCitation = {
  documentId?: string | null;
  documentName?: string | null;
  documentVersionId?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  finalRank?: number | null;
  score?: number | null;
};

export type ChatResponse = {
  requestId: string;
  chatbotId: string;
  outcome: "answered" | "insufficient_evidence" | "restricted" | "conflict" | "escalate" | string;
  answer: {
    text: string;
    warnings?: string[];
  };
  citations: ChatCitation[];
  trace?: {
    messages?: {
      sessionId?: string;
      sessionToken?: string;
      userMessageId?: string;
      assistantMessageId?: string;
    };
  };
};

export type ChatStreamEventName =
  | "start"
  | "message_delta"
  | "message_complete"
  | "fallback"
  | "escalation"
  | "citations"
  | "error"
  | "done";

export type ChatStreamEvent = {
  event: ChatStreamEventName;
  data: Record<string, unknown>;
};

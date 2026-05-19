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
  institutionName?: string | null;
  logoUrl?: string | null;
  introMessage?: string | null;
  welcomeMessage: string;
  quickReplyHints: string[];
  privacyNotice?: string | null;
  citationMode: string;
  citationPresentation?: string | null;
  theme: {
    primaryColor?: string | null;
    textColor?: string | null;
    backgroundColor?: string | null;
    preset?: string | null;
    launcherIcon?: string | null;
    launcherIconUrl?: string | null;
  };
  banner: {
    title?: string | null;
    description?: string | null;
  };
  starterQuestions: string[];
  launcherHoverMessage?: string | null;
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
  initialLauncherIcon?: string;
  initialLauncherIconUrl?: string;
  initialLauncherLabel?: string;
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
  sourceTitle?: string | null;
  documentVersionId?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  finalRank?: number | null;
  score?: number | null;
};

export type ConditionalAction = {
  type: "link" | "video" | "file" | "contact";
  label: string;
  value: string;
  description?: string;
};

export type MoreLink = { title: string; url: string };

export type TextResponse = {
  type: "text";
  content: string;
  moreLink?: MoreLink | null;
};

export type ViewResponse = {
  type: "view";
  title: string;
  content: string[];
  moreLink?: MoreLink | null;
};

export type ListItem = {
  title: string;
  contents: string[];
  sourceLinkPath?: string | null;
  sourceLinkLabel?: string | null;
  targetLink?: string | null;
  targetLinkLabel?: string | null;
};

export type ListResponse = {
  type: "list";
  schemaType: string;
  items: ListItem[];
  moreLink?: MoreLink | null;
};

export type StructuredResponse = TextResponse | ViewResponse | ListResponse;

export type ChatResponse = {
  requestId: string;
  chatbotId: string;
  outcome: "answered" | "insufficient_evidence" | "restricted" | "conflict" | "escalate" | string;
  answer: {
    text: string;
    warnings?: string[];
  };
  citations: ChatCitation[];
  followUpQuestions?: string[];
  conditionalActions?: ConditionalAction[];
  structuredResponse?: StructuredResponse | null;
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
  | "follow_up_questions"
  | "error"
  | "done";

export type ChatStreamEvent = {
  event: ChatStreamEventName;
  data: Record<string, unknown>;
};

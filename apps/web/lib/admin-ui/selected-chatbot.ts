export const ADMIN_SELECTED_CHATBOT_STORAGE_KEY = "ieumbot_admin_selected_chatbot";
export const ADMIN_SELECTED_CHATBOT_EVENT = "ieumbot-admin-chatbot-change";

export type SelectedAdminChatbot = {
  id: string;
  name: string;
};

export function readSelectedAdminChatbot(): SelectedAdminChatbot | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ADMIN_SELECTED_CHATBOT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SelectedAdminChatbot;
    if (!parsed?.id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSelectedAdminChatbot(chatbot: SelectedAdminChatbot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_SELECTED_CHATBOT_STORAGE_KEY, JSON.stringify(chatbot));
  window.dispatchEvent(new CustomEvent(ADMIN_SELECTED_CHATBOT_EVENT, { detail: chatbot }));
}

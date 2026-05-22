export type SetupKey = "ai_basic" | "ai_style" | "install";

export type SetupStatus = Partial<Record<SetupKey, boolean>>;

const STORAGE_KEY = "ieumbot_setup_status";
export const SETUP_STATUS_EVENT = "ieumbot-setup-change";

export function getSetupStatus(): SetupStatus {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as SetupStatus; }
  catch { return {}; }
}

export function markSetupDone(key: SetupKey) {
  const status = getSetupStatus();
  status[key] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  window.dispatchEvent(new Event(SETUP_STATUS_EVENT));
}

export function isSetupDone(key: SetupKey): boolean {
  return getSetupStatus()[key] === true;
}

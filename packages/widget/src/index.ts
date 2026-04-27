import { IeumWidgetApp } from "./bootstrap/widget-app";
import type { WidgetInitOptions } from "./types";

declare global {
  interface Window {
    IEUMBOTWidget?: {
      init: (options: WidgetInitOptions) => Promise<void>;
    };
  }
}

const mountedKeys = new Set<string>();

export async function initIeumWidget(options: WidgetInitOptions): Promise<void> {
  if (!options?.chatbotId) {
    throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");
  }
  const key = `${options.chatbotId}:${options.apiBaseUrl ?? ""}`;
  if (mountedKeys.has(key)) {
    return;
  }

  const app = new IeumWidgetApp(options);
  await app.mount();
  mountedKeys.add(key);
}

window.IEUMBOTWidget = {
  init: initIeumWidget,
};

const scriptTag = document.currentScript as HTMLScriptElement | null;
if (scriptTag) {
  const autoChatbotId = scriptTag.getAttribute("data-chatbot-id");
  if (autoChatbotId) {
    void initIeumWidget({
      chatbotId: autoChatbotId,
      apiBaseUrl: scriptTag.getAttribute("data-api-base-url") ?? undefined,
      openOnLoad: scriptTag.getAttribute("data-open-on-load") === "true",
    });
  }
}

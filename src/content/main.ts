import { loadSettings, onSettingsChanged } from "../shared/settings";
import { Controller } from "./controller";

/**
 * Content script entry (top frame only; same-origin iframes are handled from
 * here so navigation order spans them). Runs at document_start so our
 * capture-phase key listener is registered before any page script's.
 */
declare global {
  interface Window {
    __squarb?: Controller;
  }
}

if (!window.__squarb) {
  const send = (msg: object) => {
    try {
      void chrome.runtime.sendMessage(msg);
    } catch {
      /* extension reloaded; page needs a refresh */
    }
  };
  const controller = new Controller(document, {
    openOptions: () => send({ type: "open-options" }),
    openExplainer: (anchor?: string) => send({ type: "open-explainer", anchor }),
  });
  window.__squarb = controller;
  void loadSettings().then((s) => controller.setSettings(s));
  onSettingsChanged((s) => controller.setSettings(s));
  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg?.type === "toggle-help") controller.toggleHelp();
  });
}

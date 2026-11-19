/** Service worker: opens extension pages on behalf of content scripts. */

chrome.runtime.onMessage.addListener((msg: { type?: string; anchor?: string }) => {
  if (msg?.type === "open-options") {
    void chrome.runtime.openOptionsPage();
  } else if (msg?.type === "open-explainer") {
    const hash = msg.anchor ? `#${encodeURIComponent(msg.anchor)}` : "";
    void chrome.tabs.create({ url: chrome.runtime.getURL(`explain.html${hash}`) });
  }
});

// Toolbar button shows the cheat sheet on the current page.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  chrome.tabs.sendMessage(tab.id, { type: "toggle-help" }).catch(() => {
    // Restricted page (chrome://, Web Store) or not yet loaded: show options instead.
    void chrome.runtime.openOptionsPage();
  });
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("explain.html#welcome") });
});

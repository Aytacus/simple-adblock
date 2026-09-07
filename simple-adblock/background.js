let enabled = true;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
  updateIcon();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["enabled"], (data) => {
    enabled = data.enabled !== false;
    updateIcon();
  });
});

function updateIcon() {
  const mood = enabled ? "angry" : "happy";
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setIcon({
    path: {
      "16": `icons/icon16_${mood}.png`,
      "48": `icons/icon48_${mood}.png`,
      "128": `icons/icon128_${mood}.png`
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "toggle") {
    enabled = msg.enabled;
    chrome.storage.local.set({ enabled });
    updateIcon();

    if (!enabled) {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRuleIds: ["adblock_rules"]
      });
    } else {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRuleIds: ["adblock_rules"]
      });
    }

    sendResponse({ enabled });
  }

  if (msg.type === "getStatus") {
    sendResponse({ enabled });
  }

  return true;
});

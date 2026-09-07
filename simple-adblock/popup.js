const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");
const faceIcon = document.getElementById("faceIcon");

chrome.runtime.sendMessage({ type: "getStatus" }, (data) => {
  if (data) {
    toggle.checked = data.enabled;
    updateStatusUI(data.enabled);
  }
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.runtime.sendMessage({ type: "toggle", enabled }, (data) => {
    if (data) {
      updateStatusUI(data.enabled);
    }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "toggle", enabled });
    }
  });
});

function updateStatusUI(enabled) {
  statusText.textContent = enabled ? "On" : "Off";
  faceIcon.textContent = enabled ? "😠" : "😊";
}
(() => {
  // YouTube ad interceptor — runs in MAIN world
  // 1) Strip ad data from player responses so ads never load
  // 2) Fallback: if ad still appears, instant-skip it

  // --- Ad fields to remove from player responses ---
  const AD_FIELDS = [
    "adPlacements", "playerAds", "adSlots", "adBreak", "adPlacement",
    "adBreakOffsetMs", "adVodMetadata", "adFallback",
    "adBreakHeartbeatParams", "adSignalsInfo"
  ];

  const stripAds = (obj, depth) => {
    if (!obj || typeof obj !== "object" || depth > 25) return obj;
    try {
      if (Array.isArray(obj)) {
        for (const item of obj) stripAds(item, depth + 1);
        return obj;
      }
      for (const key of Object.keys(obj)) {
        if (AD_FIELDS.indexOf(key) >= 0) {
          try { delete obj[key]; } catch (e) {}
        } else {
          stripAds(obj[key], depth + 1);
        }
      }
    } catch (e) {}
    return obj;
  };

  const isPlayerEndpoint = (url) =>
    typeof url === "string" &&
    /\/youtubei\/v1\/(player|get_watch|tenx_player)/.test(url);

  // --- fetch interception ---
  try {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const resPromise = origFetch.apply(this, args);
      if (!isPlayerEndpoint(url)) return resPromise;

      return resPromise.then((response) => {
        try {
          return response.clone().json().then((data) => {
            stripAds(data, 0);
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }).catch(() => response);
        } catch (e) {
          return response;
        }
      });
    };
  } catch (e) {}

  // --- XHR interception ---
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._adUrl = url || "";
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const xhr = this;
      if (xhr._adUrl && isPlayerEndpoint(xhr._adUrl)) {
        this.addEventListener("load", function () {
          try {
            const text = xhr.responseText;
            if (!text) return;
            const data = JSON.parse(text);
            stripAds(data, 0);
            const filtered = JSON.stringify(data);
            try {
              Object.defineProperty(this, "responseText", { value: filtered, writable: true });
              Object.defineProperty(this, "response", { value: filtered, writable: true });
            } catch (e) {}
          } catch (e) {}
        });
      }
      return origSend.apply(this, arguments);
    };
  } catch (e) {}

  // --- Hook ytInitialPlayerResponse ---
  let _initialResp = window.ytInitialPlayerResponse;
  try {
    if (_initialResp && typeof _initialResp === "object") stripAds(_initialResp, 0);
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get() { return _initialResp; },
      set(v) {
        try { if (v && typeof v === "object") stripAds(v, 0); } catch (e) {}
        _initialResp = v;
      }
    });
  } catch (e) {}

  // Clean embedded player response in ytplayer.config.args (may be a JSON string)
  try {
    if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
      const args = window.ytplayer.config.args;
      const pr = args.raw_player_response || args.player_response;
      if (typeof pr === "string") {
        const parsed = JSON.parse(pr);
        stripAds(parsed, 0);
        if (args.raw_player_response) args.raw_player_response = JSON.stringify(parsed);
      } else if (pr && typeof pr === "object") {
        stripAds(pr, 0);
      }
    }
  } catch (e) {}

  // --- Fallback: fast-forward & instant-skip ads if they appear ---
  let lastAdState = false;

  const isAdPlaying = (p) => {
    if (!p) return false;
    return p.classList.contains("ad-showing") || p.classList.contains("ad-interrupting");
  };

  const handleAds = () => {
    try {
      const p = document.getElementById("movie_player");
      if (!p) return;

      const adNow = isAdPlaying(p);

      if (adNow) {
        // 1. Skip via AdsManager if available
        try {
          if (typeof p.getAdsManager === "function") {
            const am = p.getAdsManager();
            if (am) {
              if (typeof am.skip === "function") am.skip();
              if (typeof am.destroy === "function") am.destroy();
            }
          }
        } catch (e) {}

        // 2. Click skip button if available
        try {
          const skipBtn = p.querySelector(
            ".ytp-ad-skip-button-container button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-slot button, button.ytp-ad-skip-button-modern, .ytp-ad-overlay-close-button"
          );
          if (skipBtn) skipBtn.click();
        } catch (e) {}

        // 3. Fast-forward video ad to the end and mute
        const videos = p.querySelectorAll("video");
        videos.forEach((v) => {
          try {
            if (v.dataset.adblockOldMuted === undefined) {
              v.dataset.adblockOldMuted = v.muted ? "true" : "false";
            }
            if (v.dataset.adblockOldRate === undefined) {
              v.dataset.adblockOldRate = String(v.playbackRate || 1);
            }

            v.muted = true;
            v.playbackRate = 16;

            if (!isNaN(v.duration) && v.duration > 0) {
              v.currentTime = v.duration;
            } else {
              v.currentTime = 999999;
            }

            if (v.paused) {
              v.play().catch(() => {});
            }
          } catch (e) {}
        });

        lastAdState = true;
      } else if (lastAdState) {
        // Ad just ended! Restore user's video settings
        const videos = p.querySelectorAll("video");
        videos.forEach((v) => {
          try {
            if (v.dataset.adblockOldMuted !== undefined) {
              v.muted = v.dataset.adblockOldMuted === "true";
              delete v.dataset.adblockOldMuted;
            }
            if (v.dataset.adblockOldRate !== undefined) {
              v.playbackRate = parseFloat(v.dataset.adblockOldRate) || 1;
              delete v.dataset.adblockOldRate;
            }
            if (v.paused) {
              v.play().catch(() => {});
            }
          } catch (e) {}
        });

        lastAdState = false;
      }
    } catch (e) {}
  };

  // Check every 50ms
  setInterval(handleAds, 50);

  // Auto-dismiss anti-adblock enforcement popups and "continue watching" interruptions
  const dismissInterruptionToast = () => {
    try {
      // 1. YouTube anti-adblock enforcement dialogs
      const enforcements = document.querySelectorAll("ytd-enforcement-message-view-model");
      if (enforcements.length > 0) {
        enforcements.forEach((el) => {
          const dialog = el.closest("tp-yt-paper-dialog") || el.closest("ytd-popup-container") || el;
          dialog.style.setProperty("display", "none", "important");
          el.style.setProperty("display", "none", "important");
        });

        document.querySelectorAll("tp-yt-iron-overlay-backdrop, yt-iron-overlay-backdrop").forEach((bd) => {
          bd.style.setProperty("display", "none", "important");
        });

        const video = document.querySelector("#movie_player video");
        if (video && video.paused) {
          video.play().catch(() => {});
        }
      }

      // 2. YouTube "Video paused. Continue watching?" confirmation dialog
      const confirmDialogs = document.querySelectorAll("yt-confirm-dialog-renderer");
      confirmDialogs.forEach((cd) => {
        const confirmBtn = cd.querySelector("#confirm-button, button");
        if (confirmBtn) confirmBtn.click();
      });
    } catch (e) {}
  };

  setInterval(dismissInterruptionToast, 200);

  let mo;
  const watch = () => {
    const p = document.getElementById("movie_player");
    if (!p) { setTimeout(watch, 200); return; }
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => { handleAds(); });
    mo.observe(p, { attributes: true, attributeFilter: ["class"] });
  };
  watch();
  document.addEventListener("yt-navigate-finish", watch);
  document.addEventListener("DOMContentLoaded", watch);
})();

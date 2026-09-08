(() => {
  // YouTube ad interceptor — runs in MAIN world
  // 1) Strip ad data from player/next/browse responses so ads never load
  // 2) Clean window.ytInitialPlayerResponse / window.ytInitialData
  // 3) Fallback: instant-mute, 16x speedup & auto-skip any active video ads
  // 4) Suppress "Kesinti mi yaşıyorsunuz?" (Experiencing interruptions) toasts & anti-adblock dialogs
  // 5) Keep channel selection and standard dialogs intact

  const CLEANABLE_ENDPOINTS = [
    /\/youtubei\/v1\/(player|next|browse|reel|get_watch|tenx_player)/
  ];

  const isCleanableEndpoint = (url) => {
    if (typeof url !== "string") return false;
    return CLEANABLE_ENDPOINTS.some((re) => re.test(url));
  };

  // --- Ad cleaner for JSON data objects ---
  const cleanData = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 20) return;
    try {
      if (Array.isArray(obj)) {
        for (let i = obj.length - 1; i >= 0; i--) {
          const item = obj[i];
          if (item && typeof item === "object") {
            if (
              item.adSlotRenderer ||
              item.inFeedAdLayoutRenderer ||
              item.promotedVideoRenderer ||
              item.promotedSparklesWebRenderer ||
              item.compactPromotedVideoRenderer ||
              item.displayAdRenderer ||
              item.statementBannerRenderer ||
              item.bannerPromoRenderer ||
              item.brandVideoSingletonRenderer ||
              item.brandVideoShelfRenderer ||
              item.adPlacementRenderer ||
              item.playerLegacyDesktopWatchAdsRenderer
            ) {
              obj.splice(i, 1);
            } else {
              cleanData(item, depth + 1);
            }
          }
        }
        return;
      }

      if ("adPlacements" in obj) obj.adPlacements = [];
      if ("playerAds" in obj) obj.playerAds = [];
      if ("adSlots" in obj) obj.adSlots = [];

      const keysToDelete = [
        "adBreak", "adPlacement", "adBreakOffsetMs", "adVodMetadata", "adFallback",
        "adBreakHeartbeatParams", "adSignalsInfo", "adSlotRenderer",
        "inFeedAdLayoutRenderer", "promotedVideoRenderer", "promotedSparklesWebRenderer",
        "compactPromotedVideoRenderer", "displayAdRenderer", "statementBannerRenderer",
        "bannerPromoRenderer", "brandVideoSingletonRenderer", "brandVideoShelfRenderer",
        "playerLegacyDesktopWatchAdsRenderer"
      ];

      for (const key of Object.keys(obj)) {
        if (keysToDelete.includes(key)) {
          try { delete obj[key]; } catch (e) {}
        } else if (key !== "adPlacements" && key !== "playerAds" && key !== "adSlots") {
          cleanData(obj[key], depth + 1);
        }
      }
    } catch (e) {}
  };

  // --- Wrap Response object cleanly ---
  function wrapResponse(res) {
    try {
      const origJson = res.json.bind(res);
      const origText = res.text.bind(res);
      const origClone = res.clone.bind(res);

      res.json = async function () {
        try {
          const data = await origJson();
          cleanData(data);
          return data;
        } catch (e) {
          return origJson();
        }
      };

      res.text = async function () {
        try {
          const text = await origText();
          const data = JSON.parse(text);
          cleanData(data);
          return JSON.stringify(data);
        } catch (e) {
          return origText();
        }
      };

      res.clone = function () {
        const cloned = origClone();
        return wrapResponse(cloned);
      };
    } catch (e) {}
    return res;
  }

  // --- Fetch interception ---
  try {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const fetchPromise = origFetch.apply(this, args);
      if (!isCleanableEndpoint(url)) return fetchPromise;

      return fetchPromise.then((response) => {
        if (!response) return response;
        return wrapResponse(response);
      });
    };
  } catch (e) {}

  // --- XHR interception ---
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const origResponseText = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
    const origResponse = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");

    XMLHttpRequest.prototype.open = function (method, url) {
      this._adUrl = typeof url === "string" ? url : "";
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (this._adUrl && isCleanableEndpoint(this._adUrl)) {
        let cachedCleanText = null;
        let cachedCleanResponse = null;

        const getCleanedText = () => {
          if (cachedCleanText !== null) return cachedCleanText;
          try {
            const raw = origResponseText && origResponseText.get ? origResponseText.get.call(this) : this.responseText;
            if (raw) {
              const data = JSON.parse(raw);
              cleanData(data);
              cachedCleanText = JSON.stringify(data);
              return cachedCleanText;
            }
          } catch (e) {}
          return origResponseText && origResponseText.get ? origResponseText.get.call(this) : "";
        };

        Object.defineProperty(this, "responseText", {
          configurable: true,
          get: getCleanedText
        });

        Object.defineProperty(this, "response", {
          configurable: true,
          get() {
            if (this.responseType === "" || this.responseType === "text") {
              return getCleanedText();
            }
            if (this.responseType === "json") {
              if (cachedCleanResponse !== null) return cachedCleanResponse;
              try {
                const raw = origResponse && origResponse.get ? origResponse.get.call(this) : null;
                if (raw && typeof raw === "object") {
                  cleanData(raw);
                  cachedCleanResponse = raw;
                  return cachedCleanResponse;
                }
              } catch (e) {}
            }
            return origResponse && origResponse.get ? origResponse.get.call(this) : null;
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  } catch (e) {}

  // --- Hook window.ytInitialPlayerResponse & window.ytInitialData ---
  let _initialResp = window.ytInitialPlayerResponse;
  if (_initialResp && typeof _initialResp === "object") cleanData(_initialResp);
  try {
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get() { return _initialResp; },
      set(v) {
        if (v && typeof v === "object") cleanData(v);
        _initialResp = v;
      }
    });
  } catch (e) {}

  let _initialData = window.ytInitialData;
  if (_initialData && typeof _initialData === "object") cleanData(_initialData);
  try {
    Object.defineProperty(window, "ytInitialData", {
      configurable: true,
      get() { return _initialData; },
      set(v) {
        if (v && typeof v === "object") cleanData(v);
        _initialData = v;
      }
    });
  } catch (e) {}

  // Clean embedded player config args
  const cleanYtPlayer = () => {
    try {
      if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
        const args = window.ytplayer.config.args;
        const pr = args.raw_player_response || args.player_response;
        if (typeof pr === "string") {
          const parsed = JSON.parse(pr);
          cleanData(parsed);
          if (args.raw_player_response) args.raw_player_response = JSON.stringify(parsed);
          if (args.player_response) args.player_response = JSON.stringify(parsed);
        } else if (pr && typeof pr === "object") {
          cleanData(pr);
        }
      }
    } catch (e) {}
  };
  cleanYtPlayer();

  // --- Video Ad Fast-Forward & Instant Skip Handler ---
  const isAdActive = (player) => {
    if (!player) return false;
    if (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")) {
      return true;
    }
    const adModule = player.querySelector(".ytp-ad-module, .video-ads");
    if (adModule && adModule.children.length > 0) {
      return true;
    }
    const adOverlay = player.querySelector(
      ".ytp-ad-player-overlay, .ytp-ad-text, .ytp-ad-preview-text, .ytp-ad-skip-button-slot, .ytp-ad-duration-remaining"
    );
    if (adOverlay) {
      return true;
    }
    return false;
  };

  const handleVideoAds = () => {
    try {
      cleanYtPlayer();
      const player = document.getElementById("movie_player");
      if (!player) return;

      const adPlaying = isAdActive(player);

      if (adPlaying) {
        // 1. Click skip / close buttons immediately
        const skipButtons = player.querySelectorAll(
          ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-slot button, .ytp-ad-skip-button-container button, button.ytp-ad-skip-button-modern, .ytp-ad-overlay-close-button, .ytp-ad-survey-button"
        );
        skipButtons.forEach((btn) => {
          try { btn.click(); } catch (e) {}
        });

        // 2. Trigger player internal skip APIs
        try {
          if (typeof player.skipAd === "function") player.skipAd();
          if (typeof player.cancelPlayback === "function") player.cancelPlayback();
          if (typeof player.getAdsManager === "function") {
            const am = player.getAdsManager();
            if (am) {
              if (typeof am.skip === "function") am.skip();
              if (typeof am.destroy === "function") am.destroy();
            }
          }
        } catch (e) {}

        // 3. Fast-forward & mute video elements
        const videos = player.querySelectorAll("video");
        videos.forEach((v) => {
          try {
            if (!v.dataset.adblockActive) {
              v.dataset.adblockActive = "true";
              v.dataset.adblockOrigMuted = v.muted ? "true" : "false";
              v.dataset.adblockOrigRate = String(v.playbackRate || 1);
            }

            v.muted = true;
            v.playbackRate = 16;

            if (Number.isFinite(v.duration) && v.duration > 0) {
              v.currentTime = v.duration;
            }

            if (v.paused) {
              v.play().catch(() => {});
            }
          } catch (e) {}
        });
      } else {
        // Ad is not playing: restore original playback settings if an ad just ended
        const videos = player.querySelectorAll("video");
        videos.forEach((v) => {
          try {
            if (v.dataset.adblockActive) {
              if (v.dataset.adblockOrigMuted !== undefined) {
                v.muted = v.dataset.adblockOrigMuted === "true";
              }
              if (v.dataset.adblockOrigRate !== undefined) {
                v.playbackRate = parseFloat(v.dataset.adblockOrigRate) || 1;
              }
              delete v.dataset.adblockActive;
              delete v.dataset.adblockOrigMuted;
              delete v.dataset.adblockOrigRate;
              if (v.paused) {
                v.play().catch(() => {});
              }
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
  };

  setInterval(handleVideoAds, 50);

  // --- Auto-dismiss "Kesinti mi yaşıyorsunuz?" (Experiencing interruptions) toasts & dialogs ---
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

      // 2. YouTube "Kesinti mi yaşıyorsunuz? / Experiencing interruptions?" toast
      const toasts = document.querySelectorAll(
        "tp-yt-paper-toast, yt-notification-action-renderer, ytd-notification-action-renderer"
      );
      toasts.forEach((t) => {
        t.style.setProperty("display", "none", "important");
        t.style.setProperty("visibility", "hidden", "important");
        t.style.setProperty("opacity", "0", "important");
        t.style.setProperty("pointer-events", "none", "important");
        const btn = t.querySelector("#button, button");
        if (btn) {
          try { btn.click(); } catch (e) {}
        }
      });

      // 3. YouTube "Video paused. Continue watching?" confirmation dialog
      const confirmDialogs = document.querySelectorAll("yt-confirm-dialog-renderer");
      confirmDialogs.forEach((cd) => {
        const confirmBtn = cd.querySelector("#confirm-button, button");
        if (confirmBtn) confirmBtn.click();
      });
    } catch (e) {}
  };

  setInterval(dismissInterruptionToast, 100);

  let mo;
  const watch = () => {
    const p = document.getElementById("movie_player");
    if (!p) { setTimeout(watch, 200); return; }
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => { handleVideoAds(); });
    mo.observe(p, { attributes: true, attributeFilter: ["class"] });
  };
  watch();
  document.addEventListener("yt-navigate-finish", watch);
  document.addEventListener("DOMContentLoaded", watch);
})();

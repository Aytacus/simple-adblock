(() => {
  // YouTube ad interceptor — runs in MAIN world
  // 1) Strip ad data from player responses so ads never load
  // 2) Fallback: if ad still appears, fast-forward it (no DOM removal)

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

  // --- ytcfg ad config cleanup ---
  const clearConfig = (cfg) => {
    try {
      if (!cfg) return;
      ["ADSENSE_ACCOUNT_ID", "AD_BREAKS_ENABLE", "GOOGLE_FEEDBACK_PRODUCT_ID"]
        .forEach((k) => { try { delete cfg[k]; } catch (e) {} });
    } catch (e) {}
  };
  try {
    if (window.yt && window.yt.setConfig) {
      const orig = window.yt.setConfig.bind(window.yt);
      window.yt.setConfig = function (obj) { clearConfig(obj); return orig(obj); };
    }
    clearConfig(window.yt && window.yt.config_);
  } catch (e) {}

  // --- Hook ytInitialPlayerResponse ---
  // Embedded player response is set via assignment, bypasses fetch interception.
  let _initialResp;
  try {
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get() { return _initialResp; },
      set(v) {
        try { if (v && typeof v === "object") stripAds(v, 0); } catch (e) {}
        _initialResp = v;
      }
    });
  } catch (e) {}
  try { if (window.ytInitialPlayerResponse) stripAds(window.ytInitialPlayerResponse, 0); } catch (e) {}

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

  // --- Fallback: fast-forward ads if they still appear ---
  let lastAdState = false;
  let playerEl = null;

  const getPlayer = () => {
    try {
      if (!playerEl || !playerEl.isConnected) {
        playerEl = document.getElementById("movie_player");
      }
    } catch (e) { playerEl = null; }
    return playerEl;
  };

  const isAd = (p) =>
    p.classList.contains("ad-showing") ||
    p.classList.contains("ad-interrupting");

  const adsManagerSkip = (p) => {
    try {
      if (typeof p.getAdsManager !== "function") return false;
      const am = p.getAdsManager();
      if (!am) return false;
      if (typeof am.skip === "function") { am.skip(); return true; }
      if (typeof am.destroy === "function") { am.destroy(); return true; }
    } catch (e) {}
    return false;
  };

  const fastForward = () => {
    try {
      const p = getPlayer();
      if (!p) return;
      const adNow = isAd(p);

      if (adNow) {
        if (adsManagerSkip(p)) { lastAdState = true; return; }

        const sb = p.querySelector(
          ".ytp-ad-skip-button-container button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button"
        );
        if (sb) {
          try { sb.click(); } catch (e) {}
          lastAdState = true;
          return;
        }

        // Last resort: mute + fast-forward, save user settings
        const videos = p.querySelectorAll("video");
        videos.forEach((v) => {
          try {
            if (!v.dataset.adblockOldRate) v.dataset.adblockOldRate = String(v.playbackRate);
            if (!v.dataset.adblockOldMuted) v.dataset.adblockOldMuted = v.muted ? "true" : "false";
            v.muted = true;
            v.playbackRate = 32;
          } catch (e) {}
        });
      } else if (lastAdState) {
        // Ad ended — restore user settings
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
          } catch (e) {}
        });
      }

      lastAdState = adNow;
    } catch (e) {}
  };

  setInterval(fastForward, 600);

  let mo;
  const watch = () => {
    const p = document.getElementById("movie_player");
    if (!p) { setTimeout(watch, 500); return; }
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => { fastForward(); });
    mo.observe(p, { attributes: true, attributeFilter: ["class"] });
  };
  watch();
  document.addEventListener("yt-navigate-finish", watch);
})();

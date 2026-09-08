(() => {
  const AD_SELECTORS = [
    '[id*="google_ads"]',
    '[class*="google-ad"]',
    '[class*="googlesyndication"]',
    '[class*="ad-banner"]',
    '[class*="ad-container"]',
    '[class*="ad-wrapper"]',
    '[class*="advertisement"]',
    '[class*="sponsored"]',
    '[data-ad-slot]',
    '[data-ad-unit]',
    '[data-google-query-id]',
    '.adsbygoogle',
    '#google_ads_iframe',
    '.dfp-ad',
    '.sponsored-content',
    '[aria-label="advertisement"]',
    '[aria-label="Sponsored"]'
  ];

  const YOUTUBE_AD_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-in-feed-ad-renderer',
    'ytd-video-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    'ytd-merch-shelf-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    '.ytd-companion-slot-renderer',
    'yt-mealbar-promo-renderer',
    'ytd-mealbar-promo-renderer',
    '.ytp-ad-overlay-container',
    '.ytp-ad-message-container',
    '.ytp-ad-action-interstitial',
    '#player-ads',
    '#masthead-ad',
    'ytm-promoted-video-renderer',
    'ytm-promoted-search-renderer'
  ];

  const IFRAME_AD_PATTERNS = [
    /doubleclick\.net/i,
    /googlesyndication\.com/i,
    /googleadservices\.com/i,
    /amazon-adsystem\.com/i,
    /adnxs\.com/i,
    /taboola\.com/i,
    /outbrain\.com/i
  ];

  let enabled = true;

  function getFullSelector() {
    return AD_SELECTORS.concat(YOUTUBE_AD_SELECTORS).join(", ");
  }

  function hideAds() {
    const selector = getFullSelector();
    document.querySelectorAll(selector).forEach((el) => {
      if (!el.getAttribute("data-adblock-hidden")) {
        el.setAttribute("data-adblock-hidden", "true");
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("overflow", "hidden", "important");
      }
    });

    document.querySelectorAll("iframe").forEach((iframe) => {
      const src = iframe.src || iframe.getAttribute("data-src") || "";
      if (IFRAME_AD_PATTERNS.some((p) => p.test(src))) {
        if (!iframe.getAttribute("data-adblock-hidden")) {
          iframe.setAttribute("data-adblock-hidden", "true");
          iframe.style.setProperty("display", "none", "important");
        }
      }
    });
  }

  function observeDom() {
    const selector = getFullSelector();

    const observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          try {
            if (node.matches && node.matches(selector)) {
              node.style.setProperty("display", "none", "important");
              node.setAttribute("data-adblock-hidden", "true");
            } else if (node.querySelectorAll) {
              node.querySelectorAll(selector).forEach((el) => {
                el.style.setProperty("display", "none", "important");
                el.setAttribute("data-adblock-hidden", "true");
              });
            }
          } catch (e) {}
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  chrome.storage.local.get(["enabled"], (data) => {
    enabled = data.enabled !== false;
    start();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle") {
      enabled = msg.enabled;
      if (enabled) {
        hideAds();
      } else {
        document.querySelectorAll("[data-adblock-hidden]").forEach((el) => {
          el.style.display = "";
          el.removeAttribute("data-adblock-hidden");
        });
      }
    }
  });

  function start() {
    if (enabled) {
      hideAds();
      observeDom();
    }
  }
})();

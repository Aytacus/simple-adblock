# Simple Adblock

> A lightweight Manifest V3 ad blocker for Chrome with dedicated YouTube support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- Blocks banner and iframe ads on all sites via DOM filtering
- Removes ads from YouTube player responses before the player loads them
- Skips in-player YouTube ads via the player's AdsManager API
- Falls back to fast-forwarding (32x) when ads appear anyway
- Simple on/off toggle — no stats, no clutter
- Icon reflects state: angry face when enabled, happy face when disabled

## How It Works

### YouTube (`content_main.js`, MAIN world)

1. **Response interception** — hooks `fetch` and `XMLHttpRequest` to strip ad-related fields
   (`adPlacements`, `playerAds`, `adSlots`, `adBreak`, etc.) from
   `/youtubei/v1/player`, `/youtubei/v1/get_watch` and `/youtubei/v1/tenx_player` responses.
2. **Config cleanup** — removes ad config keys from `ytcfg` and hooks
   `ytInitialPlayerResponse` to filter embedded player data.
3. **Fallback skip** — if an ad still appears in the player, it is skipped through
   `AdsManager.skip()`, then a click on the native skip button, then a 32x fast-forward
   as last resort. User playback speed and mute state are restored afterwards.

### General web (`content.js`)

- Hides common ad containers by selector and blocks iframes from known ad networks
  (DoubleClick, Google Ads, Amazon Ads, etc.).
- MutationObserver hides newly added ad elements without re-scanning the whole page.

### Network blocking (`rules.json`)

- `declarativeNetRequest` rules block requests to ad-related domains
  (pagead2.googlesyndication.com, doubleclick.net, googleads.g.doubleclick.net,
  YouTube ad endpoints, etc.).

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `simple-adblock/` folder
   (the inner directory, not the repository root).
5. The extension appears in the toolbar.

> Note: Development builds must be loaded as an unpacked extension.
> This project is not published to the Chrome Web Store.

## Project Structure

```
simple-adblock/
├── README.md
├── LICENSE
└── simple-adblock/        # The extension itself
    ├── manifest.json      # MV3 manifest
    ├── background.js      # Service worker: toggle state + icon
    ├── content.js         # General web ad hiding
    ├── content_main.js    # YouTube ad interception (MAIN world)
    ├── content.css        # Additional hiding styles
    ├── popup.html / .css / .js  # Toolbar popup
    ├── rules.json         # declarativeNetRequest rules
    ├── generate_icons.py  # Regenerates the icon set (requires Pillow)
    └── icons/             # Generated icons (16/48/128, angry & happy)
```

## Regenerating Icons

```sh
pip install Pillow
python generate_icons.py
```

## License

[MIT](LICENSE)
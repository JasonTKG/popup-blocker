# Popup Blocker

A Firefox add-on that blocks pop-ups and new tabs opened by scripts, including ad clicks on page overlays.

## What it does
- **Smart (default):** blocks pop-ups and new tabs that scripts open, unless you clicked a real button or link.
  Clicks on page-wide overlays don't count, so the "click anywhere, get an ad tab" trick is blocked.
- **Standard:** blocks only pop-ups opened without a click (close to Firefox's built-in blocker).
- **Strict:** blocks every script-opened pop-up.
- A per-site allow list, a badge count, and a list of blocked pop-ups, each with an "Open" button.

Pick the mode and manage allowed sites from the toolbar button.

## Privacy
No data is collected and the add-on makes no network requests. Settings stay in your browser's extension storage.

## Install
From Firefox Add-ons (addons.mozilla.org). Firefox 128 or later.

To run it from source: `npx web-ext run` in this folder.

## Problems and requests
Open an issue in this repository with the page address (if you can share it) and the mode you were using.

## Licence
MIT. See [LICENSE](LICENSE).

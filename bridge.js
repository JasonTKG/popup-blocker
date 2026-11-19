// Popup Blocker: isolated-world bridge. Forwards "blocked" reports from main.js to the background script.
// A page could fake these events; the worst case is a wrong count or an extra list entry, and the popup only
// offers http(s) links, opened by the user's own click.
(() => {
  "use strict";
  const api = globalThis.browser || globalThis.chrome;
  const EVENT = "__popup_blocker_blocked__";
  let sent = 0;

  if (window === window.top) {
    try { Promise.resolve(api.runtime.sendMessage({ type: "page" })).catch(() => {}); } catch (_) { /* ignore */ }
  }

  document.addEventListener(EVENT, (ev) => {
    if (sent >= 200) return; // a runaway page can't flood the background script
    let d;
    try { d = JSON.parse(String(ev.detail)); } catch (_) { return; }
    if (!d || typeof d.url !== "string") return;
    sent += 1;
    try {
      Promise.resolve(api.runtime.sendMessage({
        type: "blocked",
        url: d.url.slice(0, 2000),
        kind: String(d.kind || "").slice(0, 40),
        frame: location.href.slice(0, 500),
      })).catch(() => {});
    } catch (_) { /* ignore */ }
  }, true);
})();

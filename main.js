// Popup Blocker: page-world script. Registered by background.js at document_start in every frame, after one
// cfg/<mode>.js file, and never on sites the user allowed. Both run before any page script, so the page can't
// change the mode or grab the original window.open first.
(() => {
  "use strict";
  const MODE_KEY = "__popupBlockerMode__";
  const EVENT = "__popup_blocker_blocked__";
  const mode = ["standard", "smart", "strict"].includes(globalThis[MODE_KEY]) ? globalThis[MODE_KEY] : "smart";
  try { delete globalThis[MODE_KEY]; } catch (_) { /* ignore */ }

  const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,option,' +
    '[role="button"],[role="link"],[role="menuitem"],[role="tab"],[contenteditable=""],[contenteditable="true"]';
  const RECENT_MS = 1000;
  // Elements covering at least this share of the viewport are treated as click-jacking overlays in smart mode.
  const OVERLAY_SHARE = 0.5;

  let last = { t: -Infinity, ok: false };

  function isOverlay(el) {
    try {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      return (w * h) / (vw * vh) >= OVERLAY_SHARE;
    } catch (_) {
      return false;
    }
  }

  function interactiveTarget(ev) {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [ev.target];
    for (const n of path) {
      if (!n || n.nodeType !== 1) continue;
      if (n === document.documentElement || n === document.body) break;
      if (n.matches(INTERACTIVE)) return !isOverlay(n);
    }
    return false;
  }

  for (const type of ["pointerdown", "mousedown", "click", "keydown", "touchend"]) {
    window.addEventListener(type, (ev) => {
      if (!ev.isTrusted) return;
      last = { t: performance.now(), ok: interactiveTarget(ev) };
    }, true);
  }

  function activated() {
    const ua = navigator.userActivation;
    if (ua && typeof ua.isActive === "boolean") return ua.isActive;
    return performance.now() - last.t < RECENT_MS;
  }

  // "block" or "allow" for a script-opened window or tab.
  function decide() {
    if (mode === "strict") return "block";
    if (!activated()) return "block";
    if (mode === "smart" && !(performance.now() - last.t < RECENT_MS && last.ok)) return "block";
    return "allow";
  }

  function absolute(url) {
    if (url === undefined || url === null || String(url) === "") return "about:blank";
    try { return new URL(String(url), document.baseURI).href; } catch (_) { return String(url).slice(0, 2000); }
  }

  function report(url, kind) {
    try {
      document.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify({ url: absolute(url), kind, mode }) }));
    } catch (_) { /* ignore */ }
  }

  function opensNewContext(target) {
    const t = String(target || "").trim().toLowerCase();
    return t !== "" && t !== "_self" && t !== "_parent" && t !== "_top" && !t.startsWith("_self");
  }

  const patched = new WeakSet();

  function patchWindow(win) {
    if (!win || patched.has(win)) return;
    let realOpen;
    try { realOpen = win.open; } catch (_) { return; } // cross-origin
    if (typeof realOpen !== "function") return;
    patched.add(win);
    const open = function open(url, target, features) {
      if (decide() === "block") {
        report(url, "window.open");
        return null;
      }
      return Reflect.apply(realOpen, this === undefined ? win : this, arguments);
    };
    try {
      Object.defineProperty(win, "open", { value: open, writable: true, configurable: true, enumerable: true });
    } catch (_) { /* ignore */ }

    const A = win.HTMLAnchorElement && win.HTMLAnchorElement.prototype;
    if (A) {
      const realClick = A.click;
      A.click = function click() {
        if (opensNewContext(this.target) && decide() === "block") {
          report(this.href, "link.click");
          return undefined;
        }
        return Reflect.apply(realClick, this, arguments);
      };
    }
    const F = win.HTMLFormElement && win.HTMLFormElement.prototype;
    if (F) {
      const realSubmit = F.submit;
      F.submit = function submit() {
        if (opensNewContext(this.target) && decide() === "block") {
          report(this.action, "form.submit");
          return undefined;
        }
        return Reflect.apply(realSubmit, this, arguments);
      };
    }
    const E = win.EventTarget && win.EventTarget.prototype;
    if (E) {
      const realDispatch = E.dispatchEvent;
      E.dispatchEvent = function dispatchEvent(ev) {
        try {
          if (ev && ev.type === "click" && this instanceof win.HTMLAnchorElement && opensNewContext(this.target) &&
              decide() === "block") {
            report(this.href, "link.dispatch");
            return false;
          }
        } catch (_) { /* fall through */ }
        return Reflect.apply(realDispatch, this, arguments);
      };
    }
    // Same-origin child frames created by script (about:blank) don't always get the content script.
    const I = win.HTMLIFrameElement && win.HTMLIFrameElement.prototype;
    for (const prop of ["contentWindow", "contentDocument"]) {
      const d = I && Object.getOwnPropertyDescriptor(I, prop);
      if (!d || !d.get) continue;
      Object.defineProperty(I, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get() {
          const v = Reflect.apply(d.get, this, []);
          try { patchWindow(prop === "contentWindow" ? v : v && v.defaultView); } catch (_) { /* ignore */ }
          return v;
        },
      });
    }
  }

  patchWindow(window);

  // Untrusted clicks on target=_blank links that are in the document.
  document.addEventListener("click", (ev) => {
    if (ev.isTrusted) return;
    const a = ev.target && ev.target.closest && ev.target.closest("a[href]");
    if (a && opensNewContext(a.target) && decide() === "block") {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      report(a.href, "link.synthetic");
    }
  }, true);
})();

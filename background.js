// Popup Blocker: background script. Keeps the page-world blocker registered with the chosen mode, minus the
// sites the user allowed, and keeps a per-tab list of blocked popups for the toolbar popup. Nothing leaves the
// browser.
"use strict";
const api = globalThis.browser || globalThis.chrome;
const SCRIPT_ID = "popup-blocker-main";
const MODES = ["standard", "smart", "strict", "off"];
const MAX_PER_TAB = 50;

async function settings() {
  const s = await api.storage.local.get({ mode: "smart", allow: [] });
  return { mode: MODES.includes(s.mode) ? s.mode : "smart", allow: Array.isArray(s.allow) ? s.allow : [] };
}

function excludeFor(host) {
  return [`*://${host}/*`, `*://*.${host}/*`];
}

async function sync() {
  const { mode, allow } = await settings();
  try {
    const existing = await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (existing.length) await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch (_) { /* nothing registered */ }
  if (mode === "off") return;
  const script = {
    id: SCRIPT_ID,
    js: [`cfg/${mode}.js`, "main.js"],
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,
    matchOriginAsFallback: true,
    world: "MAIN",
    persistAcrossSessions: true,
  };
  const exclude = allow.filter((h) => /^[a-z0-9.-]+$/i.test(h)).flatMap(excludeFor);
  if (exclude.length) script.excludeMatches = exclude;
  await api.scripting.registerContentScripts([script]);
}

// Per-tab blocked list, kept in session storage so it survives the background script being suspended.
const area = api.storage.session || null;
const memory = {};

async function getList(tabId) {
  if (!area) return memory[tabId] || [];
  const k = `tab:${tabId}`;
  return (await area.get({ [k]: [] }))[k];
}

async function setList(tabId, list) {
  if (!area) { memory[tabId] = list; return; }
  await area.set({ [`tab:${tabId}`]: list });
}

async function badge(tabId, n) {
  try {
    await api.action.setBadgeText({ tabId, text: n ? String(n) : "" });
    await api.action.setBadgeBackgroundColor({ tabId, color: "#b3261e" });
  } catch (_) { /* tab gone */ }
}

// One write at a time, so quick successive reports don't overwrite each other.
let queue = Promise.resolve();
function serial(fn) {
  queue = queue.then(fn, fn);
  return queue;
}

api.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId === undefined || !msg || typeof msg !== "object") return;
  if (msg.type === "page" && sender.frameId === 0) {
    serial(async () => { await setList(tabId, []); await badge(tabId, 0); });
  } else if (msg.type === "blocked") {
    serial(async () => {
      const list = await getList(tabId);
      list.push({ url: String(msg.url), kind: String(msg.kind), t: Date.now() });
      await setList(tabId, list.slice(-MAX_PER_TAB));
      await badge(tabId, list.length);
    });
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  if (area) area.remove(`tab:${tabId}`);
  else delete memory[tabId];
});

// Re-registration runs one at a time, so quick setting changes can't race on the script id.
let syncing = Promise.resolve();
function resync() {
  syncing = syncing.then(sync, sync).catch(() => {});
  return syncing;
}

api.storage.onChanged.addListener((changes, name) => {
  if (name === "local" && (changes.mode || changes.allow)) resync();
});
api.runtime.onInstalled.addListener(() => resync());
api.runtime.onStartup.addListener(() => resync());

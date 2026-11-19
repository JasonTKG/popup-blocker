"use strict";
const api = globalThis.browser || globalThis.chrome;
const ALL = { origins: ["<all_urls>"] };
const $ = (id) => document.getElementById(id);
const HINTS = {
  smart: "Blocks pop-ups unless you clicked a real button or link. Clicks on page-wide overlays don't count.",
  standard: "Blocks pop-ups opened without a click.",
  strict: "Blocks every pop-up that a script opens. Allow a site if it needs pop-ups, e.g. to sign in.",
  off: "Pop-up blocking is off on every site.",
};

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : "";
  } catch (_) {
    return "";
  }
}

async function main() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const host = tab ? hostOf(tab.url || "") : "";
  const { mode, allow } = await api.storage.local.get({ mode: "smart", allow: [] });

  if (!(await api.permissions.contains(ALL))) {
    $("perm").hidden = false;
    $("grant").addEventListener("click", async () => {
      if (await api.permissions.request(ALL)) $("perm").hidden = true;
    });
  }

  $("host").textContent = host || "This page can't be changed";
  $("allowSite").checked = !!host && allow.includes(host);
  $("allowSite").disabled = !host;
  $("allowSite").addEventListener("change", async (ev) => {
    const cur = (await api.storage.local.get({ allow: [] })).allow.filter((h) => h !== host);
    if (ev.target.checked) cur.push(host);
    await api.storage.local.set({ allow: cur });
    $("reload").hidden = false;
  });

  $("mode").value = mode;
  $("hint").textContent = HINTS[mode] || "";
  $("mode").addEventListener("change", async (ev) => {
    await api.storage.local.set({ mode: ev.target.value });
    $("hint").textContent = HINTS[ev.target.value] || "";
    $("reload").hidden = false;
  });

  if (!tab || !api.storage.session) return;
  const k = `tab:${tab.id}`;
  const list = (await api.storage.session.get({ [k]: [] }))[k];
  $("count").textContent = String(list.length);
  $("empty").hidden = list.length > 0;
  for (const item of list.slice().reverse()) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "url";
    span.textContent = item.url;
    span.title = item.url;
    li.append(span);
    if (/^https?:\/\//i.test(item.url)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Open";
      b.addEventListener("click", () => api.tabs.create({ url: item.url, index: tab.index + 1 }));
      li.append(b);
    }
    $("list").append(li);
  }
}

main();

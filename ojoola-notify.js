/* Ojoola notification inbox for students. */
(function () {
"use strict";
const core = window.OjoolaCore;
if (!core || !core.me || core.me.role === "admin" || window.__ojoolaNotify) return;
window.__ojoolaNotify = true;
const API = core.api;
let items = [], unread = 0, lastUnread = null, badge = null, panel = null;
async function call(path, body) {
const r = await fetch(API + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: "Bearer " + core.token() }, body: body ? JSON.stringify(body) : undefined });
const d = await r.json().catch(() => ({}));
if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Request failed");
return d;
}
function fmt(ts) {
return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function toast(t) {
const e = document.createElement("div");
e.textContent = t;
e.style.cssText = "position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);max-width:88vw;background:#14213d;color:#fff;padding:11px 16px;border-radius:14px;font:14px Arial,sans-serif;z-index:100000;box-shadow:0 8px 24px rgba(0,0,0,.3)";
document.body.appendChild(e);
setTimeout(() => e.remove(), 4000);
}
function paint() {
badge.textContent = unread > 99 ? "99+" : String(unread);
badge.style.display = unread ? "flex" : "none";
}
function render() {
const box = document.getElementById("ojNList");
box.innerHTML = "";
if (!items.length) {
box.innerHTML = '<div class="ojNEmpty">No messages yet.</div>';
return;
}
items.forEach(i => {
const el = document.createElement("div");
el.className = "ojNItem" + (i.read ? "" : " new");
const h = document.createElement("div");
h.className = "ojNT";
h.textContent = i.title;
if (!i.read) {
const t = document.createElement("span");
t.className = "ojNTag";
t.textContent = "New";
h.appendChild(t);
}
const b = document.createElement("div");
b.className = "ojNB";
b.textContent = i.body;
const d = document.createElement("small");
d.textContent = fmt(i.ts) + (i.read ? " · Read" : " · Unread");
el.append(h, b, d);
el.onclick = () => markRead(i);
box.appendChild(el);
});
}
function markRead(i) {
if (i.read) return;
i.read = true;
unread = Math.max(0, unread - 1);
paint();
render();
call("/api/notifications/read", { id: i.id }).catch(() => {});
}
async function load() {
try {
const d = await call("/api/notifications");
items = d.items || [];
unread = d.unread || 0;
if (lastUnread !== null && unread > lastUnread) toast("You have a new message from Ọjọ́ọ̀la");
lastUnread = unread;
paint();
if (!panel.classList.contains("ojNHide")) render();
} catch (_) {}
}
const css = document.createElement("style");
css.textContent = [
".ojNHide{display:none!important}",
".ojNBadge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:#dc2626;color:#fff;font:800 10px Arial;display:none;align-items:center;justify-content:center}",
".ojN{position:fixed;inset:0;z-index:72;background:rgba(0,0,0,.5);display:flex;align-items:flex-end}",
".ojNBox{width:100%;max-width:720px;margin:0 auto;height:min(86vh,640px);height:min(86dvh,640px);background:#fff;color:#172033;border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden;font-family:Arial,Helvetica,sans-serif}",
"body.dark .ojNBox{background:#121c2e;color:#e8edf7}",
".ojNHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(128,128,128,.25)}",
".ojNHead button{border:0;background:none;color:inherit;font-size:14px;padding:6px 8px}",
".ojNList{flex:1;min-height:0;overflow-y:auto;padding:12px}",
".ojNItem{border:1px solid rgba(128,128,128,.3);border-radius:16px;padding:12px;margin-bottom:10px}",
".ojNItem.new{border-color:#2563eb;border-left-width:5px;background:rgba(37,99,235,.08)}",
".ojNT{font-weight:800;font-size:15px;margin-bottom:6px}",
".ojNTag{margin-left:8px;background:#2563eb;color:#fff;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:800}",
".ojNB{font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}",
".ojNItem small{display:block;opacity:.7;font-size:11px;margin-top:8px}",
".ojNEmpty{text-align:center;opacity:.7;padding:40px 10px;font-size:14px}"
].join("\n");
document.head.appendChild(css);
const row = document.querySelector("#topHeader .flex");
if (!row) return;
const settings = row.querySelector('button[aria-label="Settings"]');
const bell = document.createElement("button");
bell.className = "iconBtn";
bell.style.position = "relative";
bell.setAttribute("aria-label", "Notifications");
bell.innerHTML = '🔔<span class="ojNBadge"></span>';
badge = bell.querySelector(".ojNBadge");
row.insertBefore(bell, settings || null);
panel = document.createElement("div");
panel.className = "ojN ojNHide";
panel.innerHTML = '<div class="ojNBox"><div class="ojNHead"><b>Notifications</b><span><button id="ojNAll">Mark all read</button><button id="ojNClose">✕</button></span></div><div id="ojNList" class="ojNList"></div></div>';
document.body.appendChild(panel);
bell.onclick = () => { panel.classList.remove("ojNHide"); render(); load(); };
document.getElementById("ojNClose").onclick = () => panel.classList.add("ojNHide");
panel.addEventListener("click", e => { if (e.target === panel) panel.classList.add("ojNHide"); });
document.getElementById("ojNAll").onclick = () => {
items.forEach(i => { i.read = true; });
unread = 0;
paint();
render();
call("/api/notifications/read", { all: true }).catch(() => {});
};
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
load();
setInterval(load, 60000);
})();

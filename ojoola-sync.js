/* Ojoola sync: keeps each account's courses, chats, notes and study files on the server. */
(function () {
"use strict";
const core = window.OjoolaCore;
if (!core || !core.me || window.__ojoolaSync) return;
window.__ojoolaSync = true;
const API = core.api;
const uid = localStorage.getItem("ojoola_uid") || "";
const KEYS = ["ojoola_courses", "ojoola_general_chat", "ojoola_file_notes", "ojoola_live_notes"];
const META = "ojoola_acct_" + uid + "__ojoola_sync_meta";
const CH = 700000;
let meta = { ts: {}, dirty: {} };
try { meta = Object.assign(meta, JSON.parse(localStorage.getItem(META) || "{}")); } catch (_) {}
if (!meta.ts) meta.ts = {};
if (!meta.dirty) meta.dirty = {};
let started = false, applying = false, timer = null, pushing = false, busyFiles = false;
const saveMeta = () => { try { localStorage.setItem(META, JSON.stringify(meta)); } catch (_) {} };
async function call(path, body) {
const r = await fetch(API + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: "Bearer " + core.token() }, body: body ? JSON.stringify(body) : undefined });
const d = await r.json().catch(() => ({}));
if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Request failed");
return d;
}
function bar(text, onTap) {
let b = document.getElementById("ojSyncBar");
if (!text) { if (b) b.remove(); return; }
if (!b) {
b = document.createElement("button");
b.id = "ojSyncBar";
document.body.appendChild(b);
}
b.style.cssText = "position:fixed;left:12px;right:12px;bottom:84px;z-index:99997;border:0;border-radius:14px;padding:11px;color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);background:" + (onTap ? "#2563eb" : "#14213d");
b.textContent = text;
b.onclick = onTap || null;
}
function schedule() {
clearTimeout(timer);
timer = setTimeout(pushAll, 4000);
}
const origSet = Storage.prototype.setItem;
Storage.prototype.setItem = function (k, v) {
const r = origSet.apply(this, arguments);
if (this === localStorage && started && !applying && KEYS.indexOf(String(k)) > -1) {
meta.dirty[String(k)] = 1;
saveMeta();
schedule();
}
return r;
};
function idb() {
return new Promise((res, rej) => {
const r = indexedDB.open("ojoola_files", 1);
r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("files")) r.result.createObjectStore("files"); };
r.onsuccess = () => res(r.result);
r.onerror = () => rej(r.error);
});
}
async function idbGet(k) {
const db = await idb();
return new Promise((res, rej) => {
const q = db.transaction("files", "readonly").objectStore("files").get(k);
q.onsuccess = () => { db.close(); res(q.result); };
q.onerror = () => { db.close(); rej(q.error); };
});
}
async function idbPut(k, v) {
const db = await idb();
return new Promise((res, rej) => {
const t = db.transaction("files", "readwrite");
t.objectStore("files").put(v, k);
t.oncomplete = () => { db.close(); res(); };
t.onerror = () => { db.close(); rej(t.error); };
});
}
function readCourses() {
try { return JSON.parse(localStorage.getItem("ojoola_courses") || "[]") || []; } catch (_) { return []; }
}
function fileItems() {
const out = [];
readCourses().forEach(c => {
(c.pdfs || []).forEach(f => { if (f && f.id) out.push({ f, kind: "pdf" }); });
(c.pictures || []).forEach(f => { if (f && f.id) out.push({ f, kind: "picture" }); });
});
return out;
}
async function uploadFile(f, kind, data) {
const total = Math.max(1, Math.ceil(data.length / CH));
for (let i = 0; i < total; i++) {
await call("/api/files/put", { id: f.id, kind, name: f.name || "", mime: f.mimeType || "", size: f.size || 0, part: i, total, len: data.length, data: data.slice(i * CH, (i + 1) * CH) });
}
}
async function downloadFile(id) {
let out = "", total = 1;
for (let i = 0; i < total; i++) {
const d = await call("/api/files/get?id=" + encodeURIComponent(id) + "&part=" + i);
total = d.total || 1;
out += d.data;
}
return out;
}
async function reconcileFiles() {
if (busyFiles || !started || !meta.ts.ojoola_courses) return;
const items = fileItems();
busyFiles = true;
try {
const remote = await call("/api/files/list");
const remoteIds = new Set((remote.files || []).map(x => x.id));
const localIds = new Set(items.map(x => x.f.id));
for (const it of items) {
if (remoteIds.has(it.f.id)) continue;
const data = await idbGet(it.f.id);
if (data) await uploadFile(it.f, it.kind, data);
}
const need = [];
for (const it of items) {
if (!remoteIds.has(it.f.id)) continue;
if (!(await idbGet(it.f.id))) need.push(it);
}
let got = 0;
for (const it of need) {
bar("Restoring your study files (" + (got + 1) + " of " + need.length + ")…");
const data = await downloadFile(it.f.id);
if (data) { await idbPut(it.f.id, data); got++; }
}
if (items.length) {
for (const id of remoteIds) if (!localIds.has(id)) await call("/api/files/delete", { id });
}
if (got) bar("Your study files are back. Tap to refresh.", () => location.reload());
else bar("");
} catch (_) {
bar("");
}
busyFiles = false;
}
async function pull(k) {
const d = await call("/api/sync/get?key=" + encodeURIComponent(k));
if (d.value == null) return false;
applying = true;
try { localStorage.setItem(k, d.value); } finally { applying = false; }
meta.ts[k] = d.updated;
return true;
}
async function pushAll() {
if (pushing || !started) return;
const keys = Object.keys(meta.dirty);
if (!keys.length) return;
pushing = true;
let courses = false;
try {
for (const k of keys) {
const v = localStorage.getItem(k);
if (v == null || v === "") { delete meta.dirty[k]; continue; }
const d = await call("/api/sync/put", { key: k, value: v });
meta.ts[k] = d.updated;
if (localStorage.getItem(k) === v) delete meta.dirty[k];
if (k === "ojoola_courses") courses = true;
}
saveMeta();
} catch (_) {
saveMeta();
setTimeout(schedule, 30000);
}
pushing = false;
if (Object.keys(meta.dirty).length) schedule();
if (courses) reconcileFiles();
}
async function init() {
let list;
try { list = await call("/api/sync/list"); } catch (_) { started = true; return; }
const server = {};
(list.keys || []).forEach(x => { server[x.key] = x.updated; });
const need = KEYS.filter(k => !meta.dirty[k] && (server[k] || 0) > (meta.ts[k] || 0));
if (need.length) bar("Syncing your study space…");
let pulled = false;
try { for (const k of need) { if (await pull(k)) pulled = true; } } catch (_) {}
for (const k of KEYS) if (!server[k] && localStorage.getItem(k) && !meta.dirty[k]) meta.dirty[k] = 1;
saveMeta();
started = true;
bar("");
if (pulled) {
const n = Number(sessionStorage.getItem("ojoola_sync_reloads") || 0);
if (n < 2) {
sessionStorage.setItem("ojoola_sync_reloads", String(n + 1));
location.reload();
return;
}
}
pushAll();
reconcileFiles();
}
document.addEventListener("visibilitychange", () => {
if (document.hidden && Object.keys(meta.dirty).length) { clearTimeout(timer); pushAll(); }
});
window.OjoolaSync = { flush: pushAll };
init();
})();

/* Ojoola admin notifications. Adds a Notify tab to admin.html. */
(function () {
"use strict";
if (window.__ojoolaAdminNotify) return;
window.__ojoolaAdminNotify = true;
const tabs = document.querySelector(".tabs");
const wrap = document.querySelector(".wrap");
if (!tabs || !wrap) return;
const css = document.createElement("style");
css.textContent = [
".nField{width:100%;border:1.5px solid var(--line);border-radius:13px;padding:12px;background:var(--card);color:var(--text);font:inherit;outline:none}",
"textarea.nField{resize:vertical;min-height:110px}",
".nRow{display:flex;gap:8px;margin:10px 0}",
".nRow button{flex:1}",
".nOn{background:var(--blue)!important;color:#fff!important}",
".nPick{max-height:260px;overflow-y:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);margin-top:8px}",
".nPick label{display:flex;align-items:center;gap:10px;padding:10px 12px;margin:0;border-bottom:1px solid var(--line);font-weight:400}",
".nPick input{width:18px;height:18px}",
".nPrev{background:var(--soft);color:var(--text);border-radius:14px;padding:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;margin:6px 0 10px}",
".nHist{display:block;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:8px;width:100%;text-align:left;color:inherit}",
".nHist small{display:block;color:var(--muted);margin-top:4px;font-size:12px}"
].join("\n");
document.head.appendChild(css);
const tBtn = document.createElement("button");
tBtn.id = "tNotify";
tBtn.textContent = "Notify";
tabs.appendChild(tBtn);
const pane = document.createElement("div");
pane.id = "notifyPane";
pane.className = "hidden";
pane.innerHTML =
'<div class="sec">New notification</div>' +
'<input id="nTitle" class="nField" type="text" maxlength="60" value="A message from Ọjọ́ọ̀la">' +
'<textarea id="nMsg" class="nField" maxlength="1500" placeholder="Write your message…" style="margin-top:8px"></textarea>' +
'<div class="info" style="margin-top:6px">Each person\'s first name is added automatically ("Hello Emmanuel, …"). You can also type {name} where you want it.</div>' +
'<div class="nRow"><button class="b nOn" id="nAll">All users</button><button class="b" id="nSel">Select users</button></div>' +
'<div id="nPickWrap" class="hidden"><input id="nSearch" type="search" placeholder="Search users"><div id="nPick" class="nPick"></div><div class="info" id="nCount"></div></div>' +
'<div class="sec">Preview</div><div id="nPrev" class="nPrev"></div>' +
'<button class="primary" id="nSend">Send notification</button>' +
'<div id="nStatus" class="info" style="margin-top:8px"></div>' +
'<div class="sec" style="margin-top:18px">History</div>' +
'<div id="nHistList"></div>' +
'<div id="nDetail" class="hidden"></div>';
wrap.appendChild(pane);
let mode = "all", sending = false;
const chosen = new Set();
const U = () => (typeof users !== "undefined" ? users : []);
const tpl = m => (m.indexOf("{name}") > -1 ? m : "Hello {name}, " + m);
function preview() {
let first = "Emmanuel";
if (mode === "selected" && chosen.size) {
const u = U().find(x => chosen.has(x.id));
if (u) first = u.firstName;
}
const m = $("nMsg").value.trim() || "Your message appears here.";
$("nPrev").textContent = tpl(m).split("{name}").join(first);
}
function renderPick() {
const q = $("nSearch").value.trim().toLowerCase();
const rows = U().filter(u => u.status === "active" && (!q || [u.firstName, u.username, u.email].join(" ").toLowerCase().includes(q)));
$("nPick").innerHTML = rows.map(u => '<label><input type="checkbox" data-id="' + u.id + '"' + (chosen.has(u.id) ? " checked" : "") + '>' + esc(u.firstName) + ' <span style="color:var(--muted)">@' + esc(u.username) + '</span></label>').join("") || '<div class="empty">No users found.</div>';
$("nCount").textContent = chosen.size + " selected";
}
function setMode(m) {
mode = m;
$("nAll").classList.toggle("nOn", m === "all");
$("nSel").classList.toggle("nOn", m === "selected");
$("nPickWrap").classList.toggle("hidden", m !== "selected");
if (m === "selected") renderPick();
preview();
}
$("nAll").onclick = () => setMode("all");
$("nSel").onclick = () => setMode("selected");
$("nMsg").oninput = preview;
$("nSearch").oninput = renderPick;
$("nPick").addEventListener("change", e => {
const c = e.target.closest("[data-id]");
if (!c) return;
const id = Number(c.dataset.id);
if (c.checked) chosen.add(id); else chosen.delete(id);
$("nCount").textContent = chosen.size + " selected";
preview();
});
async function run(id, total) {
let r = { pending: total, emailed: 0, failed: 0 };
let guard = 0;
while (r.pending > 0 && guard++ < 500) {
r = await api("/api/admin/notify/send", { id });
$("nStatus").textContent = "Sending… " + Math.max(0, total - r.pending) + " of " + total;
if (!r.processed) break;
}
$("nStatus").textContent = "Done. " + r.emailed + " emailed, " + r.failed + " failed. Everyone also has it in their in-app inbox.";
return r;
}
$("nSend").onclick = async () => {
if (sending) return;
const message = $("nMsg").value.trim();
const title = $("nTitle").value.trim() || "A message from Ọjọ́ọ̀la";
if (!message) { toast("Write a message first."); return; }
if (mode === "selected" && !chosen.size) { toast("Choose at least one user."); return; }
const who = mode === "all" ? "all active users" : chosen.size + " selected user(s)";
if (!confirm("Send this to " + who + "? Emails go out now.")) return;
sending = true;
$("nSend").disabled = true;
$("nStatus").textContent = "Preparing…";
try {
const c = await api("/api/admin/notify/create", { title, message, mode, userIds: [...chosen] });
await run(c.id, c.total);
$("nMsg").value = "";
preview();
} catch (e) { toast(e.message); $("nStatus").textContent = e.message; }
sending = false;
$("nSend").disabled = false;
loadHist();
};
async function loadHist() {
try {
const d = await api("/api/admin/notify/list");
$("nHistList").innerHTML = d.items.length ? d.items.map(i => '<button class="nHist" data-id="' + i.id + '"><b>' + esc(i.title) + '</b><small>' + when(i.createdAt) + ' · ' + esc(i.preview) + '</small><small>To ' + i.total + ' · Emailed ' + i.emailed + ' · Failed ' + i.failed + ' · Read ' + i.read + '</small></button>').join("") : '<div class="empty">Nothing sent yet.</div>';
} catch (e) { toast(e.message); }
}
$("nHistList").addEventListener("click", e => {
const b = e.target.closest("[data-id]");
if (b) showDetail(Number(b.dataset.id));
});
async function showDetail(id) {
try {
const d = await api("/api/admin/notify/detail?id=" + id);
const failed = d.recipients.filter(r => r.emailStatus === "failed").length;
const rows = d.recipients.map(r => '<div class="ev"><div><b>' + esc(r.name || "Deleted user") + '</b><small style="display:block;color:var(--muted)">@' + esc(r.username || "") + '</small></div><div class="t" style="white-space:normal;text-align:right">' + (r.emailStatus === "sent" ? "✓ Emailed" : r.emailStatus === "failed" ? "✕ Failed" : "… Pending") + ' · ' + (r.readAt ? "Read" : "Unread") + (r.emailError ? "<br>" + esc(r.emailError) : "") + '</div></div>').join("");
$("nDetail").innerHTML = '<button class="b" id="nBack">← Back</button> ' + (failed ? '<button class="b warn" id="nRetry">Retry ' + failed + ' failed</button>' : "") + '<div class="sec">' + esc(d.notification.title) + '</div><div class="nPrev">' + esc(d.notification.message) + '</div>' + rows;
$("nDetail").classList.remove("hidden");
$("nHistList").classList.add("hidden");
$("nBack").onclick = () => { $("nDetail").classList.add("hidden"); $("nHistList").classList.remove("hidden"); loadHist(); };
const rb = $("nRetry");
if (rb) rb.onclick = async () => {
rb.disabled = true;
try {
const r = await api("/api/admin/notify/retry", { id });
await run(id, r.pending);
showDetail(id);
} catch (e) { toast(e.message); rb.disabled = false; }
};
} catch (e) { toast(e.message); }
}
function show() {
["tUsers", "tAct", "tMsg"].forEach(id => { const b = $(id); if (b) b.classList.remove("on"); });
tBtn.classList.add("on");
$("usersPane").classList.add("hidden");
$("actPane").classList.add("hidden");
const mp = $("msgPane");
if (mp) mp.classList.add("hidden");
pane.classList.remove("hidden");
if (mode === "selected") renderPick();
preview();
loadHist();
}
tBtn.onclick = show;
["tUsers", "tAct", "tMsg"].forEach(id => {
const b = $(id);
if (!b) return;
const old = b.onclick;
b.onclick = function () {
tBtn.classList.remove("on");
pane.classList.add("hidden");
if (old) return old.apply(this, arguments);
};
});
})();

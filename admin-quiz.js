/* Ojoola admin quiz activity. Adds a Quiz tab to admin.html. Shows usage only, never results. */
(function () {
"use strict";
if (window.__ojoolaAdminQuiz) return;
window.__ojoolaAdminQuiz = true;
const tabs = document.querySelector(".tabs"), wrap = document.querySelector(".wrap");
if (!tabs || !wrap) return;
const ACT = { quiz_started: "started a quiz", question_attempted: "attempted a question", quiz_completed: "completed a quiz", quiz_exited: "left a quiz before finishing" };
const QT = { multiple_choice: "Multiple choice", written: "Written" };
const tBtn = document.createElement("button");
tBtn.id = "tQuiz";
tBtn.innerHTML = 'Quiz <span id="qaBadge" style="display:none;margin-left:3px;background:#dc2626;color:#fff;border-radius:99px;padding:1px 6px;font-size:10px;font-weight:800"></span>';
tabs.appendChild(tBtn);
const pane = document.createElement("div");
pane.id = "quizActPane";
pane.className = "hidden";
pane.innerHTML = '<div class="sec">Quiz activity</div><div class="info">This shows whether students are using the quiz feature. It does not include answers, scores or results.</div><button class="b" id="qaAll" style="margin-bottom:10px">Mark all read</button><div id="qaList"></div>';
wrap.appendChild(pane);
let items = [];
function group(list) {
const out = [];
list.forEach(i => {
const g = out[out.length - 1];
if (g && g.user === i.user && g.course === i.course && g.act === i.act && g.qtype === i.qtype && g.ts - i.ts < 600000) {
g.n++;
g.ids.push(i.id);
if (!i.read) g.unread = true;
} else out.push({ user: i.user, course: i.course, act: i.act, qtype: i.qtype, ts: i.ts, n: 1, ids: [i.id], unread: !i.read });
});
return out;
}
function draw() {
const g = group(items);
$("qaList").innerHTML = g.length ? g.map(x => '<div class="ev" data-ids="' + x.ids.join(",") + '"' + (x.unread ? ' style="border-color:#2563eb"' : "") + '><div>' + (x.act === "quiz_exited" ? "⚪" : "🟢") + ' <b>' + esc(x.user) + '</b> ' + (ACT[x.act] || esc(x.act)) + (x.n > 1 ? " ×" + x.n : "") + ' <span style="color:var(--muted)">· ' + (QT[x.qtype] || "") + ' · ' + esc(x.course) + '</span></div><div class="t">' + when(x.ts) + '</div></div>').join("") : '<div class="empty">No quiz activity yet.</div>';
}
async function load() {
try {
const d = await api("/api/admin/quiz/feed");
items = d.items || [];
const b = $("qaBadge");
b.textContent = d.unread > 99 ? "99+" : String(d.unread);
b.style.display = d.unread ? "inline-block" : "none";
if (!pane.classList.contains("hidden")) draw();
} catch (_) {}
}
$("qaAll").onclick = async () => {
try { await api("/api/admin/quiz/read", { all: true }); load(); } catch (e) { toast(e.message); }
};
$("qaList").addEventListener("click", async e => {
const r = e.target.closest("[data-ids]");
if (!r) return;
try { await api("/api/admin/quiz/read", { ids: r.dataset.ids.split(",").map(Number) }); load(); } catch (_) {}
});
const OTHERS = ["tUsers", "tAct", "tMsg", "tNotify"];
const PANES = ["usersPane", "actPane", "msgPane", "notifyPane"];
tBtn.onclick = () => {
OTHERS.forEach(id => { const b = $(id); if (b) b.classList.remove("on"); });
tBtn.classList.add("on");
PANES.forEach(id => { const e = $(id); if (e) e.classList.add("hidden"); });
pane.classList.remove("hidden");
draw();
load();
};
OTHERS.forEach(id => {
const b = $(id);
if (!b) return;
const old = b.onclick;
b.onclick = function () {
tBtn.classList.remove("on");
pane.classList.add("hidden");
if (old) return old.apply(this, arguments);
};
});
setInterval(() => { if (!$("dashView").classList.contains("hidden")) load(); }, 20000);
setTimeout(load, 2500);
})();

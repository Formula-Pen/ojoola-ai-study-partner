/* Ojoola quizzes: overview, multiple-choice test, written test and progress. */
(function () {
"use strict";
const core = window.OjoolaCore;
if (!core || !core.me || window.__ojoolaQuiz) return;
window.__ojoolaQuiz = true;
const API = core.api;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COL = { Poor: "#dc2626", Fair: "#d97706", Good: "#2563eb", Excellent: "#16a34a" };
const cls = p => p >= 80 ? "Excellent" : p >= 60 ? "Good" : p >= 40 ? "Fair" : "Poor";
const fmt = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = { page: "home", kind: "mcq", run: null, answers: {}, idx: 0, timer: null, skew: 0, dirty: false, saveT: null, submitting: false, open: { mcq: null, written: null }, bank: { mcq: 0, written: 0 } };
async function call(path, body) {
let r;
try { r = await fetch(API + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: "Bearer " + core.token() }, body: body ? JSON.stringify(Object.assign({ cname: (course() || {}).name || "" }, body)) : undefined }); }
catch (_) { const e = new Error("You seem to be offline. Please check your connection and try again."); e.offline = true; throw e; }
const d = await r.json().catch(() => ({}));
if (!r.ok) { const e = new Error(typeof d.error === "string" && !/^Server error/.test(d.error) ? d.error : "Something went wrong. Please try again in a moment."); e.status = r.status; throw e; }
return d;
}
function course() { return typeof courses !== "undefined" && typeof currentCourseIndex !== "undefined" && currentCourseIndex !== null ? courses[currentCourseIndex] : null; }
const cid = () => { const c = course(); return c ? String(c.id) : ""; };
function mats() { const c = course() || {}; return { fileIds: (c.pdfs || []).filter(f => f && f.id).map(f => f.id).slice(0, 40), picIds: (c.pictures || []).filter(f => f && f.id).map(f => f.id).slice(0, 40) }; }
const body = h => { $("qzBody").innerHTML = h; };
const busy = t => body('<div class="qzCard qzC"><div class="qzSpin"></div><p>' + esc(t) + '</p></div>');
const css = document.createElement("style");
css.textContent = [
".qzCard{background:#fff;border:1px solid #e3e8f1;border-radius:20px;padding:16px;margin-bottom:12px}",
"body.dark .qzCard{background:#121c2e;border-color:#26344d}",
".qzCard h3{margin:0 0 8px;font-size:16px}",
".qzCard ul,.qzCard ol{margin:6px 0 0;padding-left:20px;line-height:1.6;font-size:14px}",
".qzC{text-align:center;padding:30px 16px}",
".qzSpin{width:30px;height:30px;margin:0 auto 12px;border:3px solid rgba(37,99,235,.25);border-top-color:#2563eb;border-radius:50%;animation:ojspin .9s linear infinite}",
".qzBtn{display:block;width:100%;border:0;border-radius:14px;padding:14px;font-weight:800;font-size:15px;margin-top:10px;background:#2563eb;color:#fff;box-shadow:0 7px 18px rgba(37,99,235,.18)}",
".qzBtn.alt{background:#eaf0ff;color:#2563eb;box-shadow:none}",
"body.dark .qzBtn.alt{background:#1d3158;color:#bfdbfe}",
".qzBtn:disabled{opacity:.5}",
".qzRow{display:flex;gap:8px}",
".qzRow .qzBtn{flex:1}",
".qzTwo{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
".qzTwo .qzCard{margin:0;font-size:13px;line-height:1.5}",
".qzOpt{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;border:2px solid #dbe3ef;background:transparent;color:inherit;border-radius:14px;padding:12px;margin-top:8px;font-size:15px;line-height:1.45}",
"body.dark .qzOpt{border-color:#334155}",
".qzOpt b{flex:0 0 26px;height:26px;border-radius:50%;background:#eaf0ff;color:#2563eb;display:grid;place-items:center;font-size:13px}",
".qzOpt.sel{border-color:#2563eb;background:rgba(37,99,235,.12)}",
".qzOpt.sel b{background:#2563eb;color:#fff}",
".qzOpt.ok{border-color:#16a34a;background:rgba(22,163,74,.12)}",
".qzOpt.bad{border-color:#dc2626;background:rgba(220,38,38,.12)}",
".qzBar{height:8px;border-radius:99px;background:#e3e8f1;overflow:hidden;margin:4px 0 10px}",
"body.dark .qzBar{background:#26344d}",
".qzBar i{display:block;height:100%;border-radius:99px;background:#2563eb}",
".qzTop{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700}",
".qzClock{font-weight:900;font-size:20px;font-variant-numeric:tabular-nums}",
".qzClock.low{color:#dc2626}",
".qzGrid{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}",
".qzGrid button{width:36px;height:36px;border-radius:10px;border:2px solid #dbe3ef;background:transparent;color:inherit;font-weight:800}",
"body.dark .qzGrid button{border-color:#334155}",
".qzGrid button.done{background:#2563eb;border-color:#2563eb;color:#fff}",
".qzGrid button.cur{outline:3px solid #f59e0b;outline-offset:1px}",
".qzChip{display:inline-block;padding:3px 10px;border-radius:99px;background:#eaf0ff;color:#2563eb;font-size:11px;font-weight:800;margin-right:4px}",
"body.dark .qzChip{background:#1d3158;color:#bfdbfe}",
".qzTA{width:100%;min-height:200px;border:2px solid #dbe3ef;border-radius:14px;padding:12px;font:inherit;font-size:15px;line-height:1.5;background:transparent;color:inherit;resize:vertical}",
"body.dark .qzTA{border-color:#334155}",
".qzTA:focus{border-color:#2563eb;outline:none}",
".qzOv{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:20px}",
".qzOv .qzCard{max-width:380px;width:100%;margin:0}",
".qzBig{text-align:center}",
".qzBig .n{font-size:40px;font-weight:900;line-height:1.1}",
".qzTiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}",
".qzTiles div{border-radius:14px;padding:10px 4px;text-align:center;background:rgba(128,128,128,.12);font-size:12px}",
".qzTiles b{display:block;font-size:22px}",
".qzLine{display:flex;justify-content:space-between;font-size:13px;gap:8px}",
".qzStat{font-size:12px;margin-top:8px}",
".qzMiss{color:#b45309;font-size:13px;margin:4px 0 0;padding-left:18px}"
].join("\n");
document.head.appendChild(css);
const sec = document.createElement("section");
sec.id = "quizView";
sec.className = "wrap hidden";
sec.innerHTML = '<div class="pageHeader"><button class="iconBtn" id="qzBack" aria-label="Back">←</button><div style="flex:1"><h2 id="qzTitle">Quizzes</h2><div class="muted" id="qzSub"></div></div></div><div id="qzBody"></div>';
document.querySelector("main").appendChild(sec);
const origSetPage = window.setPage;
window.setPage = function () { sec.classList.add("hidden"); stopTimer(); return origSetPage.apply(this, arguments); };
function openQuiz() {
const c = course();
if (!c) return;
window.setPage("courseInfo", { noHistory: true });
$("courseInfoView").classList.add("hidden");
sec.classList.remove("hidden");
$("qzTitle").textContent = c.name;
$("qzSub").textContent = c.code + " · Quizzes";
home();
window.scrollTo(0, 0);
}
function addBtn() {
if ($("qzOpenBtn")) return;
const card = document.querySelector("#courseInfoView .card");
if (!card) { setTimeout(addBtn, 500); return; }
const b = document.createElement("button");
b.id = "qzOpenBtn";
b.className = "secondary";
b.style.cssText = "width:100%;margin-top:10px";
b.textContent = "📝 Quizzes & Progress";
b.onclick = openQuiz;
const live = card.querySelector('button[onclick="proceedToLiveConversation()"]');
if (live) live.after(b); else card.appendChild(b);
}
addBtn();
$("qzBack").onclick = () => {
if (S.page === "home") { leave(); sec.classList.add("hidden"); backToCourseInfo(); }
else { leave(); home(); }
};
function stopTimer() { clearInterval(S.timer); S.timer = null; }
function leave() { stopTimer(); if (S.run && S.dirty) flush(); if (S.run && !S.submitting) call("/api/quiz/leave", { attempt: S.run.id }).catch(() => {}); S.run = null; S.submitting = false; }
function showErr(e) {
body('<div class="qzCard qzC"><p>' + esc(e.message || "Something went wrong.") + '</p><button class="qzBtn alt" data-a="home">Back to overview</button></div>');
}
/* PAGE 1: OVERVIEW */
function home() {
S.page = "home";
body('<div class="qzCard"><h3>Practise, test and track your progress</h3><p class="muted" style="margin:0;line-height:1.6">Quizzes are built only from the study materials in this course. Use a multiple-choice test for quick recall and a written test for deeper understanding, then watch your learning history grow.</p><p class="muted" id="qzBank" style="margin:8px 0 0"></p></div>' +
'<div class="qzCard"><h3>How it works</h3><ol><li>Your materials are read once and turned into a question bank for this course.</li><li>Each test picks questions you have not seen or have missed before.</li><li>Multiple-choice tests are marked instantly. Written answers are marked by AI against the key ideas in your materials.</li><li>Every result is saved, so your progress reflects your whole history, not one test.</li></ol></div>' +
'<div class="qzCard"><h3>Guidelines</h3><ul><li>Your answers save automatically and the clock keeps running if you refresh.</li><li>When time runs out, your saved answers are submitted for you.</li><li>You can retake as often as you like. A high score never blocks a new test.</li><li>Do not use notes during a test if you want an honest picture of where you stand.</li></ul></div>' +
'<div class="qzCard"><h3>Why take quizzes?</h3><ul><li>Recalling answers strengthens memory far more than rereading.</li><li>Mistakes come back later so you can fix them.</li><li>You see exactly which topics are strong and which need work.</li></ul></div>' +
'<div class="qzTwo"><div class="qzCard"><b>Multiple choice</b><br>20 questions, 10 minutes, 1 mark each. Four options per question, instant marking and explanations.</div><div class="qzCard"><b>Written test</b><br>5 questions, 20 minutes, 5 marks each. AI marks meaning, accepts your own wording and gives partial marks.</div></div>' +
'<button class="qzBtn" data-a="mcq" id="qzBtnM">Proceed to Multiple-Choice Test</button><button class="qzBtn" data-a="written" id="qzBtnW">Proceed to Written-Based Test</button><button class="qzBtn alt" data-a="progress">View My Learning Progress</button>');
call("/api/quiz/bank?course=" + encodeURIComponent(cid())).then(d => {
S.bank = d.bank; S.open = d.open;
if (S.page !== "home") return;
const t = $("qzBank");
if (t) t.textContent = "Question bank: " + d.bank.mcq + " multiple-choice and " + d.bank.written + " written questions.";
if (d.open.mcq && $("qzBtnM")) $("qzBtnM").textContent = "Resume Multiple-Choice Test";
if (d.open.written && $("qzBtnW")) $("qzBtnW").textContent = "Resume Written-Based Test";
}).catch(() => {});
}
/* PAGES 2 AND 3: INTRO */
function intro(kind) {
S.kind = kind; S.page = kind;
const m = kind === "mcq";
body('<div class="qzCard"><h3>' + (m ? "Multiple-Choice Test" : "Written-Based Test") + '</h3><ul>' +
(m ? '<li>20 questions, 1 mark each, 20 marks in total.</li><li>10 minutes on the clock.</li><li>One question at a time with four options, A to D.</li><li>Skip, go back and change answers freely until you submit.</li><li>You get your score, corrections and explanations at the end.</li>' :
'<li>5 questions, 5 marks each, 25 marks in total.</li><li>20 minutes on the clock.</li><li>Write your answer in your own words. Correct ideas in different wording earn marks.</li><li>Partly correct answers earn partial marks. Incomplete answers do not earn full marks.</li><li>Marking can take up to a minute after you submit.</li>') +
'<li>Answers save automatically. If you refresh, your answers and the original deadline are kept.</li></ul></div>' +
'<button class="qzBtn" data-a="begin">' + (S.open[kind] ? "Resume your test" : "Start test") + '</button><button class="qzBtn alt" data-a="home">Back to overview</button>');
}
async function begin(kind, mode, from) {
S.kind = kind; S.page = kind;
busy("Preparing your test…");
const N = kind === "mcq" ? 20 : 5;
try {
const m = mats();
let st = await call("/api/quiz/start", { course: cid(), kind, mode, from, ...m });
if (st.need === "generate") {
busy("Building your question bank from your study notes. The first time can take up to a minute…");
try { await call("/api/quiz/generate", { course: cid(), kind, ...m }); }
catch (e) { if (st.have < N) throw e; }
st = await call("/api/quiz/start", { course: cid(), kind, mode, from, noGen: true, ...m });
if (st.need === "generate") throw new Error("Your study materials do not yet give enough questions for a full test. Add more material or wait until your PDF has finished reading, then try again.");
}
run(st);
} catch (e) { showErr(e); }
}
function run(st) {
if (st.status === "done") { result(st); return; }
S.run = st;
S.skew = st.serverNow - Date.now();
let loc = {};
try { loc = JSON.parse(localStorage.getItem("ojoola_qz_" + st.id) || "{}") || {}; } catch (_) {}
S.answers = { ...st.answers, ...loc };
S.idx = 0; S.dirty = Object.keys(loc).length > 0; S.submitting = false;
renderRun();
startTimer();
}
const remain = () => Math.max(0, S.run.deadline - (Date.now() + S.skew));
function startTimer() { stopTimer(); tick(); S.timer = setInterval(tick, 1000); }
function tick() {
if (!S.run) { stopTimer(); return; }
const r = remain(), el = $("qzClock");
if (el) { el.textContent = fmt(r); el.classList.toggle("low", r < 60000); }
if (r <= 0) { stopTimer(); submit(true); }
}
const has = id => { const v = S.answers[id]; return S.kind === "mcq" ? Number.isInteger(v) : typeof v === "string" && v.trim().length > 0; };
function setAns(id, v) {
S.answers[id] = v;
try { localStorage.setItem("ojoola_qz_" + S.run.id, JSON.stringify(S.answers)); } catch (_) {}
S.dirty = true;
clearTimeout(S.saveT);
S.saveT = setTimeout(flush, S.kind === "written" ? 1500 : 600);
}
async function flush() {
const r = S.run;
if (!r || !S.dirty) return;
const snap = JSON.stringify(S.answers), ans = { ...S.answers };
try {
await call("/api/quiz/save", { attempt: r.id, answers: ans });
if (JSON.stringify(S.answers) === snap) S.dirty = false;
const el = $("qzStat"); if (el) el.textContent = "Answers saved";
} catch (e) {
const el = $("qzStat"); if (el) el.textContent = "Offline. Your answers are kept on this device and will save when you reconnect.";
}
}
setInterval(() => { if (S.dirty && S.run) flush(); }, 6000);
window.addEventListener("online", () => { if (S.run) flush(); });
function renderRun() {
const r = S.run, n = r.qs.length, q = r.qs[S.idx], m = S.kind === "mcq";
const done = r.qs.filter(x => has(x.id)).length;
let h = '<div class="qzCard"><div class="qzTop"><span>Question ' + (S.idx + 1) + ' of ' + n + '</span><span class="qzClock" id="qzClock">' + fmt(remain()) + '</span></div><div class="qzBar"><i style="width:' + Math.round(done / n * 100) + '%"></i></div><div class="muted">' + done + ' of ' + n + ' answered</div></div>';
h += '<div class="qzCard"><span class="qzChip">' + esc(q.topic) + '</span><p style="font-weight:700;line-height:1.55;font-size:16px;margin:10px 0 4px">' + esc(q.q) + '</p>';
if (m) h += q.opts.map((o, i) => '<button class="qzOpt' + (S.answers[q.id] === i ? " sel" : "") + '" data-a="opt" data-i="' + i + '"><b>' + "ABCD"[i] + '</b><span>' + esc(o) + '</span></button>').join("");
else h += '<textarea class="qzTA" id="qzText" placeholder="Write your answer here…">' + esc(S.answers[q.id] || "") + '</textarea><div class="muted" id="qzWc">' + wc(S.answers[q.id]) + ' words</div>';
h += '<div class="qzStat muted" id="qzStat"></div></div>';
h += '<div class="qzRow"><button class="qzBtn alt" data-a="prev"' + (S.idx ? "" : " disabled") + '>Previous</button><button class="qzBtn alt" data-a="next"' + (S.idx < n - 1 ? "" : " disabled") + '>Next</button></div>';
h += '<button class="qzBtn" data-a="ask">Submit Test</button>';
h += '<div class="qzCard" style="margin-top:12px"><div class="muted">Jump to a question</div><div class="qzGrid">' + r.qs.map((x, i) => '<button data-a="goto" data-i="' + i + '" class="' + (has(x.id) ? "done " : "") + (i === S.idx ? "cur" : "") + '">' + (i + 1) + '</button>').join("") + '</div></div>';
body(h);
}
const wc = t => { const s = String(t || "").trim(); return s ? s.split(/\s+/).length : 0; };
function confirmSubmit() {
const n = S.run.qs.length, d = S.run.qs.filter(x => has(x.id)).length;
$("qzBody").insertAdjacentHTML("beforeend", '<div class="qzOv"><div class="qzCard"><h3>Submit your test?</h3><p style="line-height:1.6;margin:0">You have answered <b>' + d + '</b> and left <b>' + (n - d) + '</b> unanswered.</p><div class="qzRow"><button class="qzBtn alt" data-a="cancel">Return</button><button class="qzBtn" data-a="submit">Submit now</button></div></div></div>');
}
async function submit(auto) {
if (S.submitting || !S.run) return;
S.submitting = true; stopTimer(); clearTimeout(S.saveT);
const r = S.run;
busy(S.kind === "written" ? "Marking your answers. This can take up to a minute…" : "Marking your test…");
try {
let st = null;
for (let i = 0; i < 6; i++) {
st = await call("/api/quiz/submit", { attempt: r.id, answers: S.answers });
if (!st.busy) break;
await sleep(3000);
}
if (st.busy) throw new Error("Your test is still being marked. Please try again in a moment.");
try { localStorage.removeItem("ojoola_qz_" + r.id); } catch (_) {}
S.run = null; S.dirty = false; S.submitting = false;
result(st);
} catch (e) {
S.submitting = false;
body('<div class="qzCard qzC"><p>' + esc(auto ? "Time is up. " : "") + esc(e.message) + '</p><p class="muted">Your answers are saved.</p><button class="qzBtn" data-a="resubmit">Try again</button><button class="qzBtn alt" data-a="home">Back to overview</button></div>');
}
}
/* RESULTS */
function scoreCard(st, tiles) {
const c = COL[st.result.cls] || "#2563eb";
return '<div class="qzCard qzBig"><div class="n" style="color:' + c + '">' + st.score + ' / ' + st.max + '</div><div style="font-size:18px;font-weight:800">' + st.pct + '%</div><span class="qzChip" style="background:' + c + ';color:#fff;margin-top:8px">' + st.result.cls + '</span>' + (tiles ? '<div class="qzTiles">' + tiles.map(t => '<div><b style="color:' + t[2] + '">' + t[1] + '</b>' + t[0] + '</div>').join("") + '</div>' : "") + '</div>';
}
function actions(st) {
const w = st.kind === "written";
return '<button class="qzBtn" data-a="retry" data-id="' + st.id + '">Retry Same Questions</button><button class="qzBtn" data-a="again">' + (w ? "Start New Test" : "Start New Quiz") + '</button><button class="qzBtn alt" data-a="progress">View My Learning Progress</button><button class="qzBtn alt" data-a="home">Back to overview</button>';
}
function result(st) {
S.kind = st.kind; S.page = st.kind;
const r = st.result || { items: [], cls: cls(st.pct) };
let h;
if (st.kind === "mcq") {
h = scoreCard(st, [["Correct", r.counts.correct, "#16a34a"], ["Incorrect", r.counts.wrong, "#dc2626"], ["Unanswered", r.counts.skipped, "#6b7280"]]) + actions(st) + '<h3 style="margin:16px 0 8px">Review and corrections</h3>';
r.items.forEach((it, n) => {
h += '<div class="qzCard"><span class="qzChip">' + (n + 1) + ' · ' + esc(it.topic) + '</span><span class="qzChip" style="background:' + (it.status === "correct" ? "#16a34a" : it.status === "wrong" ? "#dc2626" : "#6b7280") + ';color:#fff">' + it.status + '</span><p style="font-weight:700;line-height:1.5">' + esc(it.q) + '</p>' +
it.opts.map((o, i) => '<div class="qzOpt ' + (i === it.ans ? "ok" : i === it.given ? "bad" : "") + '"><b>' + "ABCD"[i] + '</b><span>' + esc(o) + '</span></div>').join("") +
(it.expl ? '<p class="muted" style="line-height:1.55"><b>Explanation:</b> ' + esc(it.expl) + '</p>' : "") + '</div>';
});
} else {
h = scoreCard(st, null);
if ((r.strengths || []).length) h += '<div class="qzCard"><h3>Strengths</h3><ul>' + r.strengths.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul></div>';
if ((r.weaknesses || []).length) h += '<div class="qzCard"><h3>Needs work</h3><ul>' + r.weaknesses.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul></div>';
h += actions(st) + '<h3 style="margin:16px 0 8px">Feedback on each answer</h3>';
r.items.forEach((it, n) => {
h += '<div class="qzCard"><span class="qzChip">' + (n + 1) + ' · ' + esc(it.topic) + '</span><span class="qzChip" style="background:' + (COL[cls(it.score / 5 * 100)]) + ';color:#fff">' + it.score + ' / 5</span><p style="font-weight:700;line-height:1.5">' + esc(it.q) + '</p><p class="muted" style="white-space:pre-wrap;line-height:1.5"><b>Your answer:</b> ' + esc(it.given || "No answer") + '</p><p style="line-height:1.55;margin:6px 0"><b>Feedback:</b> ' + esc(it.feedback) + '</p>' +
((it.missing || []).length ? '<div style="font-size:13px"><b>Missing or incorrect:</b><ul class="qzMiss">' + it.missing.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul></div>' : "") +
(it.model ? '<p class="muted" style="line-height:1.5"><b>Model answer:</b> ' + esc(it.model) + '</p>' : "") + '</div>';
});
}
body(h);
window.scrollTo(0, 0);
S.open[st.kind] = null;
}
/* PAGE 4: PROGRESS */
const ring = (p, c) => { const k = 2 * Math.PI * 52; return '<svg viewBox="0 0 120 120" width="130" height="130"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(128,128,128,.25)" stroke-width="12"/><circle cx="60" cy="60" r="52" fill="none" stroke="' + c + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (k * p / 100) + ' ' + k + '" transform="rotate(-90 60 60)"/><text x="60" y="67" text-anchor="middle" font-size="26" font-weight="800" fill="currentColor">' + Math.round(p) + '%</text></svg>'; };
function chart(h) {
const W = 320, H = 150, P = 26;
const pts = h.map((x, i) => [P + (h.length > 1 ? i * (W - 2 * P) / (h.length - 1) : (W - 2 * P) / 2), H - P - x.pct / 100 * (H - 2 * P)]);
let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">';
[0, 50, 100].forEach(v => { const y = H - P - v / 100 * (H - 2 * P); s += '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y + '" y2="' + y + '" stroke="rgba(128,128,128,.3)"/><text x="2" y="' + (y + 4) + '" font-size="10" fill="currentColor" opacity=".7">' + v + '</text>'; });
if (pts.length > 1) s += '<polyline fill="none" stroke="#94a3b8" stroke-width="2" points="' + pts.map(p => p.join(",")).join(" ") + '"/>';
pts.forEach((p, i) => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + (h[i].kind === "mcq" ? "#2563eb" : "#8b5cf6") + '"/>'; });
return s + '</svg><div class="muted"><span style="color:#2563eb">●</span> Multiple choice &nbsp; <span style="color:#8b5cf6">●</span> Written</div>';
}
const bars = (arr, col) => arr.length ? arr.map(t => '<div class="qzLine"><span>' + esc(t.topic) + '</span><b>' + t.acc + '%</b></div><div class="qzBar"><i style="width:' + t.acc + '%;background:' + col + '"></i></div>').join("") : '<p class="muted" style="margin:0">Not enough results yet.</p>';
const TREND = { improving: "↑ Improving", declining: "↓ Declining", stable: "→ Steady", building: "Building your history" };
async function progress() {
leave(); S.page = "progress";
busy("Loading your learning history…");
try {
const [p, all] = await Promise.all([call("/api/quiz/progress?course=" + encodeURIComponent(cid())), call("/api/quiz/progress?course=all")]);
if (!p.n) { body('<div class="qzCard qzC"><p>You have not completed a test in this course yet. Take a multiple-choice or written test and your progress will appear here.</p><button class="qzBtn" data-a="mcq">Multiple-Choice Test</button><button class="qzBtn alt" data-a="written">Written-Based Test</button><button class="qzBtn alt" data-a="home">Back to overview</button></div>'); return; }
const c = COL[p.cls];
let h = '';
if (all.courses && all.courses.length > 1) h += '<div class="qzCard"><h3>All your courses</h3><div class="qzLine"><span>Combined learning score</span><b style="color:' + COL[all.cls] + '">' + Math.round(all.overall) + '% · ' + all.cls + '</b></div>' + all.courses.map(x => { const cc = typeof courses !== "undefined" ? courses.find(k => String(k.id) === x.course) : null; return '<div class="qzLine" style="margin-top:6px"><span>' + esc(cc ? cc.name : "Course " + x.course) + '</span><span>' + x.overall + '% · ' + (TREND[x.trend] || "") + '</span></div>'; }).join("") + '</div>';
h += '<div class="qzCard qzBig"><div class="muted">Overall learning performance</div>' + ring(p.overall, c) + '<div><span class="qzChip" style="background:' + c + ';color:#fff">' + p.cls + '</span><span class="qzChip">' + (TREND[p.trend] || "") + '</span></div><p class="muted" style="margin:10px 0 0;line-height:1.5">' + (p.confidence === "early" ? "Early estimate. A few more tests will make it more reliable." : p.confidence === "growing" ? "Based on a growing history of " + p.n + " tests, with recent results counting more." : "Based on " + p.n + " tests. Recent results count more, and one unusual score cannot swing it.") + '</p></div>';
h += '<div class="qzTiles"><div><b>' + p.n + '</b>Tests taken</div><div><b>' + (p.nMcq ? p.avgMcq + "%" : "-") + '</b>Multiple choice avg (' + p.nMcq + ')</div><div><b>' + (p.nWritten ? p.avgWritten + "%" : "-") + '</b>Written avg (' + p.nWritten + ')</div></div>';
if (p.counts) h += '<div class="qzTiles" style="margin-bottom:12px"><div><b>' + p.counts.mastered + '</b>Mastered</div><div><b>' + p.counts.steady + '</b>Always correct</div><div><b>' + p.counts.shaky + '</b>Often missed</div></div>';
h += '<div class="qzCard"><h3>Performance over time</h3>' + chart(p.history.slice(-20)) + '</div>';
h += '<div class="qzCard"><h3>Strongest topics</h3>' + bars(p.strong, "#16a34a") + '</div><div class="qzCard"><h3>Weakest topics</h3>' + bars(p.weak, "#dc2626") + '</div>';
h += '<div class="qzCard"><h3>Improving topics</h3>' + (p.improving.length ? p.improving.map(t => '<div class="qzLine"><span>' + esc(t.topic) + '</span><b style="color:#16a34a">+' + t.delta + ' points</b></div>').join("") : '<p class="muted" style="margin:0">None yet.</p>') + '</div>';
h += '<div class="qzCard"><h3>Needs more practice</h3>' + bars(p.needs, "#d97706") + '</div>';
h += '<div class="qzCard"><h3>By difficulty</h3>' + [["Easy", 1], ["Intermediate", 2], ["Difficult", 3]].map(d => { const x = p.diffs[d[1]]; return '<div class="qzLine"><span>' + d[0] + '</span><b>' + (x.n ? x.acc + "%" : "-") + '</b></div><div class="qzBar"><i style="width:' + (x.n ? x.acc : 0) + '%"></i></div>'; }).join("") + '</div>';
h += '<div class="qzCard" id="qzAI"><h3>Your personal assessment</h3><div class="qzSpin"></div><p class="muted" style="text-align:center;margin:0">Preparing your assessment…</p></div>';
h += '<button class="qzBtn" data-a="mcq">Multiple-Choice Test</button><button class="qzBtn" data-a="written">Written-Based Test</button><button class="qzBtn alt" data-a="home">Back to overview</button>';
body(h);
call("/api/quiz/insight", { course: cid() }).then(o => insight(o, p)).catch(() => insight(null, p));
} catch (e) { showErr(e); }
}
function insight(o, p) {
const el = $("qzAI");
if (!el || S.page !== "progress") return;
let h = '<h3>Your personal assessment</h3>';
if (o && o.summary) {
h += '<p style="line-height:1.6;margin:0 0 8px">' + esc(o.summary) + '</p>';
["mastered", "attention", "changes"].forEach(k => { if (o[k]) h += '<p style="line-height:1.6;margin:0 0 8px">' + esc(o[k]) + '</p>'; });
if ((o.focus || []).length) h += '<b>What to focus on next</b><ul>' + o.focus.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul>';
} else {
h += '<p style="line-height:1.6;margin:0 0 8px">Across ' + p.n + ' tests your overall score is ' + Math.round(p.overall) + '% (' + p.cls + '), and your trend is ' + (TREND[p.trend] || "").replace(/^[↑↓→] /, "").toLowerCase() + '.</p>';
if (p.strong.length) h += '<p style="margin:0 0 8px">Strongest: ' + p.strong.map(t => esc(t.topic)).join(", ") + '.</p>';
if (p.needs.length) h += '<p style="margin:0 0 8px">Focus on: ' + p.needs.map(t => esc(t.topic)).join(", ") + '.</p>';
h += '<p class="muted" style="margin:0">The written coaching comment is unavailable right now. These figures come from your recorded results.</p>';
}
el.innerHTML = h;
}
/* EVENTS */
$("qzBody").addEventListener("click", e => {
const b = e.target.closest("[data-a]");
if (!b) return;
const a = b.dataset.a, i = Number(b.dataset.i);
if (a === "home") { leave(); home(); }
else if (a === "mcq" || a === "written") { leave(); intro(a); }
else if (a === "progress") progress();
else if (a === "begin" || a === "again") begin(S.kind, "new");
else if (a === "retry") begin(S.kind, "same", Number(b.dataset.id));
else if (a === "opt") { setAns(S.run.qs[S.idx].id, i); renderRun(); }
else if (a === "prev") { S.idx = Math.max(0, S.idx - 1); renderRun(); }
else if (a === "next") { S.idx = Math.min(S.run.qs.length - 1, S.idx + 1); renderRun(); }
else if (a === "goto") { S.idx = i; renderRun(); }
else if (a === "ask") confirmSubmit();
else if (a === "cancel") { const o = document.querySelector(".qzOv"); if (o) o.remove(); }
else if (a === "submit") { const o = document.querySelector(".qzOv"); if (o) o.remove(); submit(false); }
else if (a === "resubmit") { if (S.run) submit(false); else home(); }
});
$("qzBody").addEventListener("input", e => {
if (e.target.id !== "qzText" || !S.run) return;
setAns(S.run.qs[S.idx].id, e.target.value);
const w = $("qzWc"); if (w) w.textContent = wc(e.target.value) + " words";
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.run) tick(); });
window.addEventListener("pagehide", () => {
if (!S.run || S.submitting) return;
try { fetch(API + "/api/quiz/leave", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: "Bearer " + core.token() }, body: JSON.stringify({ attempt: S.run.id, cname: (course() || {}).name || "" }) }); } catch (_) {}
});
/* DELETED MATERIAL DATA */
const mbox = document.createElement("div");
mbox.id = "qzDeletedBox";
mbox.className = "infoSection";
let mT = null;
function placeBox() {
if (mbox.isConnected) return;
const card = document.querySelector("#courseInfoView .card");
if (!card) return;
const secs = card.querySelectorAll(".infoSection");
const last = secs[secs.length - 1];
if (last) last.after(mbox); else card.appendChild(mbox);
}
function synced() {
try {
const m = JSON.parse(localStorage.getItem("ojoola_acct_" + localStorage.getItem("ojoola_uid") + "__ojoola_sync_meta") || "{}");
return !!(m.ts && m.ts.ojoola_courses);
} catch (_) { return false; }
}
function matItems() {
const c = course() || {};
return [...(c.pdfs || []).filter(f => f && f.id).map(f => ({ id: f.id, name: f.name || "PDF", kind: "pdf" })), ...(c.pictures || []).filter(f => f && f.id).map(f => ({ id: f.id, name: f.name || "Picture", kind: "picture" }))].slice(0, 40);
}
function drawDeleted(list) {
if (!list.length) { mbox.innerHTML = ""; return; }
mbox.innerHTML = '<h3>Deleted Material Data</h3><div class="muted" style="margin-bottom:8px;line-height:1.5">These materials were deleted, but data made from them is still stored and can still appear in quizzes and progress. Erase it to remove it for good.</div>' +
list.map(x => '<div class="fileItem" style="margin-bottom:8px"><div style="min-width:0"><div style="font-weight:700;overflow-wrap:anywhere">' + (x.kind === "picture" ? "🖼 " : "📄 ") + esc(x.name) + '</div><div class="muted">Data still stored' + (x.qn ? " · " + x.qn + " questions" : "") + '</div></div><button class="danger" data-erase="' + esc(x.id) + '">Erase Data</button></div>').join("") +
(list.length > 1 ? '<button class="danger" style="width:100%" data-erase="all">Erase All Deleted Material Data</button>' : "");
}
function refreshMaterials() {
clearTimeout(mT);
mT = setTimeout(async () => {
const cc = cid();
if (!cc || $("courseInfoView").classList.contains("hidden")) return;
placeBox();
if (!synced()) return;
try {
const d = await call("/api/quiz/materials", { course: cc, items: matItems() });
if (cid() === cc) drawDeleted(d.deleted || []);
} catch (_) {}
}, 700);
}
function cleanLocal(mids) {
const set = new Set(mids);
try {
const st = JSON.parse(localStorage.getItem("ojoola_file_notes") || "{}") || {};
let ch = false;
Object.keys(st).forEach(k => {
if (set.has(k) || (k.indexOf("pics:") === 0 && k.slice(5).split("|").some(x => set.has(x)))) { delete st[k]; ch = true; }
});
if (ch) localStorage.setItem("ojoola_file_notes", JSON.stringify(st));
} catch (_) {}
try {
const lv = JSON.parse(localStorage.getItem("ojoola_live_notes") || "{}") || {};
if (lv[cid()]) { delete lv[cid()]; localStorage.setItem("ojoola_live_notes", JSON.stringify(lv)); }
} catch (_) {}
try { if (window.OjoolaSync) OjoolaSync.flush(); } catch (_) {}
}
function askErase(all, fn) {
const o = document.createElement("div");
o.className = "qzOv";
o.innerHTML = '<div class="qzCard"><h3>Erase material data?</h3><p style="line-height:1.6;margin:0">This will permanently remove the stored data associated with ' + (all ? "all deleted materials" : "this material") + ' and prevent it from being used in future quizzes, AI analysis, grading, and current course performance evaluation.</p><div class="qzRow"><button class="qzBtn alt" data-x="0">Cancel</button><button class="qzBtn" style="background:#dc2626" data-x="1">Erase Data</button></div></div>';
o.addEventListener("click", e => {
const b = e.target.closest("[data-x]");
if (!b) return;
o.remove();
if (b.dataset.x === "1") fn();
});
document.body.appendChild(o);
}
mbox.addEventListener("click", e => {
const b = e.target.closest("[data-erase]");
if (!b) return;
const all = b.dataset.erase === "all", id = b.dataset.erase;
askErase(all, async () => {
const cc = cid();
mbox.querySelectorAll("button").forEach(x => { x.disabled = true; });
try {
const d = await call("/api/quiz/erase", all ? { course: cc, all: true } : { course: cc, ids: [id] });
cleanLocal(d.erased || []);
mbox.innerHTML = '<div class="muted">Material data erased.</div>';
setTimeout(refreshMaterials, 2000);
} catch (err) {
mbox.querySelectorAll("button").forEach(x => { x.disabled = false; });
alert(err.message || "Could not erase the data. Please try again.");
}
});
});
const origRCF = window.renderCourseFiles;
if (typeof origRCF === "function") window.renderCourseFiles = function () { const r = origRCF.apply(this, arguments); refreshMaterials(); return r; };
})();

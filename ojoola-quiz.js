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
function showErr(e) { if (e && e.silent) return;
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
async function ensureNotes() {
const c = course();
const pdfs = (c.pdfs || []).filter(f => f && f.id), pics = (c.pictures || []).filter(f => f && f.id);
if (!pdfs.length && !pics.length) throw new Error("Add a PDF or picture to this course first, then come back to take a quiz.");
if (!c.ref) throw new Error("Please switch on “Use course materials as reference” on the course page, then try again.");
const t0 = Date.now(), pg = S.page;
for (;;) {
if (S.page !== pg) { const x = new Error("Cancelled."); x.silent = true; throw x; }
let pending = 0, got = 0, total = 0;
const st = getNoteStore();
pdfs.forEach(f => { const e = noteEntry(st, f.id); if (e && e.parts) got += e.parts.length; if (e && e.total) total += e.total; if (!e || !e.done) pending++; });
if (!pending) break;
if (Date.now() - t0 > 240000) { if (got) break; throw new Error("Your PDF is taking a long time to read. Please check your connection and try again in a few minutes."); }
try { startReading(c); } catch (_) {}
busy("Reading your study material" + (total ? " (" + got + " of " + total + " sections)" : "") + ". This happens once per file and can take a few minutes for a big PDF…");
await sleep(2500);
}
if (pics.some(f => f.data)) { try { await liveNotes(c); } catch (_) {} }
const store = getNoteStore(), out = [];
pdfs.forEach(f => { const e = noteEntry(store, f.id); const t = e && e.parts ? e.parts.join("\n\n") : ""; if (t.trim()) out.push({ ids: [f.id], t }); });
const pk = "pics:" + pics.filter(f => f.data).map(f => f.id).join("|");
if (typeof store[pk] === "string" && store[pk].trim()) out.push({ ids: pk.slice(5).split("|"), t: store[pk] });
return out;
}
async function begin(kind, mode, from) {
S.kind = kind; S.page = kind;
busy("Preparing your test…");
const N = kind === "mcq" ? 20 : 5;
try {
const m = mats();
let st = await call("/api/quiz/start", { course: cid(), kind, mode, from, ...m });
if (st.need === "generate") {
const notes = await ensureNotes(); if (S.page !== kind) return; busy("Building your question bank from your study notes. The first time can take up to a minute…");
try { await call("/api/quiz/generate", { course: cid(), kind, notes, ...m }); }
catch (e) { if (!st.have) throw e; }
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
return '<button class="qzBtn" data-a="retry" data-id="' + st.id + '">Retry Same Questions</button><button class="

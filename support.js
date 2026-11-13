/* Ojoola Support
   Private "Contact the Admin" chat, notification bell, and admin only invite links.
   Loaded by ojoola-core.js after the account is known. Uses the app's own classes
   (iconBtn, sendBtn, inputRow, card, primary, secondary, muted) so it matches the design. */
(function () {
  "use strict";
  const core = window.OjoolaCore;
  if (!core || !core.me || window.__ojoolaSupport) return;
  window.__ojoolaSupport = true;

  const isAdmin = core.me.role === "admin";
  const $ = id => document.getElementById(id);
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const hdr = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + core.token() });

  async function call(path, body) {
    const r = await fetch(core.api + path, body === undefined
      ? { headers: hdr() }
      : { method: "POST", headers: hdr(), body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : (d.error && d.error.message) || "Request failed");
    return d;
  }

  /* ---------- state ---------- */
  let summary = { unread: 0, threads: [] };
  let lastUnread = null;
  let threadUser = null, threadName = "";
  let msgs = [], lastSig = "";
  let replyTo = null;
  let isOpen = false;

  /* ---------- styles ---------- */
  const CSS = `
.supBell{position:relative;width:34px;height:34px;flex:0 0 34px;border:0;border-radius:11px;background:rgba(255,255,255,.2);color:#fff;font-size:16px;line-height:1;cursor:pointer}
.supBadge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center}
.supHint{font-size:11px;opacity:.92;margin:0 0 8px;min-height:0}
#supOverlay{position:fixed;inset:0;z-index:70;background:#f5f7fb;color:#172033;display:none;flex-direction:column}
#supOverlay.open{display:flex}
body.dark #supOverlay{background:#0b1220;color:#e8edf7}
.supTop{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px;border-bottom:1px solid #e5e9f1;background:#fff}
body.dark .supTop{background:#0f1727;border-color:#26344d}
.supTop h2{margin:0;font-size:18px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#supInboxWrap{flex:1;overflow-y:auto;padding:14px}
.supThreadBtn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #e0e6ef;background:#fff;color:inherit;border-radius:16px;padding:12px;margin-bottom:10px}
body.dark .supThreadBtn{background:#121c2e;border-color:#26344d}
.supThreadBtn .av{width:40px;height:40px;flex:0 0 40px;border-radius:13px;background:#eaf0ff;color:#2563eb;display:grid;place-items:center;font-weight:800}
body.dark .supThreadBtn .av{background:#1d3158;color:#bfdbfe}
.supThreadBtn .nm{flex:1;min-width:0}
.supThreadBtn .nm b{display:block}
.supThreadBtn .nm span{display:block;font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.supCount{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center}
.supMsgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
.supRow{display:flex;flex-direction:column;max-width:84%;touch-action:pan-y}
.supRow.me{align-self:flex-end;align-items:flex-end}
.supRow.them{align-self:flex-start;align-items:flex-start}
.supBub{padding:9px 12px;border-radius:16px;line-height:1.5;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere;border:2px solid transparent;transition:border-color .2s,background .2s}
.me .supBub{background:#2563eb;color:#fff;border-bottom-right-radius:5px}
.them .supBub{background:#fff;border-color:#e1e7ef;border-bottom-left-radius:5px;color:#172033}
body.dark .them .supBub{background:#121c2e;border-color:#26344d;color:#e5e7eb}
.supRow.flash .supBub{border-color:#fbbf24;background-image:linear-gradient(rgba(251,191,36,.28),rgba(251,191,36,.28))}
.supQuote{border-left:3px solid #93c5fd;background:rgba(100,116,139,.18);border-radius:8px;padding:5px 8px;margin-bottom:6px;font-size:12px;cursor:pointer;white-space:normal}
.supQuote b{display:block;font-size:11px}
.supQuote span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.supActs{display:flex;align-items:center;gap:2px;margin-top:2px}
.supActs button{border:0;background:none;color:#64748b;font-size:11px;padding:3px 6px;cursor:pointer}
.supActs i{font-style:normal;font-size:10px;color:#94a3b8;padding:0 4px}
.supComposer{padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px);border-top:1px solid #e5e9f1;background:#fff}
body.dark .supComposer{background:#0f1727;border-color:#26344d}
.supReplyBar{display:none;align-items:center;gap:8px;border-left:3px solid #2563eb;background:#eaf0ff;color:#172033;border-radius:10px;padding:6px 10px;margin-bottom:8px;font-size:12px}
body.dark .supReplyBar{background:#1d3158;color:#e8edf7}
.supReplyBar b{display:block;font-size:11px}
.supReplyBar span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.supReplyBar button{border:0;background:none;color:inherit;font-size:16px;padding:4px 8px}
.supToast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);z-index:90;background:#14213d;color:#fff;padding:10px 16px;border-radius:12px;font-size:13px;max-width:90%}
`;

  /* ---------- small helpers ---------- */
  const mine = m => (m.sender === "admin") === isAdmin;
  const whoName = s => ((s === "admin") === isAdmin ? "You" : (isAdmin ? (threadName || "User") : "Admin"));
  const clock = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function toast(t) {
    if (!t) return;
    const e = el("div", "supToast");
    e.textContent = t;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 3500);
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const x = el("textarea"); x.value = text; document.body.appendChild(x); x.select();
      try { document.execCommand("copy"); } catch (__) {}
      x.remove();
    }
    if (btn) { const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = o; }, 1200); }
  }

  /* ---------- notifications ---------- */
  function hintText(s) {
    if (!s.unread) return "";
    if (!isAdmin) return "You have a message from the Admin";
    const list = (s.threads || []).filter(t => t.unread > 0);
    const first = list[0];
    const name = first ? (first.name || first.username || "a user") : "a user";
    return "You have a message from " + name + (list.length > 1 ? " and " + (list.length - 1) + " more" : "");
  }

  function applySummary(s) {
    const viewingThread = isOpen && (!isAdmin || threadUser);
    if (lastUnread !== null && s.unread > lastUnread && !viewingThread) toast(hintText(s));
    lastUnread = s.unread;
    summary = s;
    const b = $("supBadge"), h = $("supHint");
    if (b) { b.style.display = s.unread ? "flex" : "none"; b.textContent = s.unread > 99 ? "99+" : String(s.unread); }
    if (h) h.textContent = hintText(s);
    if (isOpen && isAdmin && !threadUser) renderInbox();
  }

  async function refresh(force) {
    if (document.hidden && !force) return;
    try { applySummary(await call("/api/support/summary")); } catch (_) {}
  }

  /* ---------- overlay views ---------- */
  function show(view) {
    $("supInboxWrap").style.display = view === "inbox" ? "block" : "none";
    $("supThread").style.display = view === "thread" ? "flex" : "none";
    $("supTitle").textContent = view === "inbox" ? "Messages" : (isAdmin ? (threadName || "Conversation") : "Contact the Admin");
  }

  function openOverlay() {
    $("supOverlay").classList.add("open");
    isOpen = true;
    if (isAdmin) { threadUser = null; show("inbox"); renderInbox(); refresh(true); }
    else openThread(null, "");
  }

  function closeOverlay() {
    $("supOverlay").classList.remove("open");
    isOpen = false; threadUser = null;
    clearReply();
    refresh(true);
  }

  function back() {
    if (isAdmin && threadUser) { threadUser = null; clearReply(); show("inbox"); renderInbox(); refresh(true); }
    else closeOverlay();
  }

  function renderInbox() {
    const w = $("supInboxWrap");
    w.innerHTML = "";
    const th = summary.threads || [];
    if (!th.length) {
      const e = el("div", "muted");
      e.style.cssText = "padding:30px 16px;text-align:center";
      e.textContent = "No messages from users yet.";
      w.appendChild(e);
      return;
    }
    th.forEach(t => {
      const name = t.name || t.username || "User";
      const b = el("button", "supThreadBtn");
      const av = el("div", "av"); av.textContent = name[0].toUpperCase();
      const nm = el("div", "nm");
      const bold = el("b"); bold.textContent = name;
      const last = el("span"); last.textContent = t.lastText || "";
      nm.append(bold, last);
      b.append(av, nm);
      if (t.unread > 0) { const c = el("div", "supCount"); c.textContent = String(t.unread); b.appendChild(c); }
      b.onclick = () => openThread(t.userId, name);
      w.appendChild(b);
    });
  }

  /* ---------- thread ---------- */
  async function openThread(uid, name) {
    threadUser = uid; threadName = name || "";
    msgs = []; lastSig = "";
    clearReply();
    $("supMsgs").innerHTML = "";
    show("thread");
    await loadThread(true);
  }

  async function loadThread(stick) {
    if (isAdmin && !threadUser) return;
    try {
      const d = await call("/api/support/thread" + (isAdmin ? "?user=" + threadUser : ""));
      if (d.who && !threadName) { threadName = d.who.name || d.who.username || "User"; $("supTitle").textContent = threadName; }
      const last = d.messages[d.messages.length - 1];
      const sig = d.messages.length + ":" + (last ? last.id : 0);
      if (sig !== lastSig) { lastSig = sig; msgs = d.messages; renderMsgs(stick); }
      if (summary.unread) refresh(true);
    } catch (e) { if (stick) alert(e.message); }
  }

  function renderMsgs(stick) {
    const box = $("supMsgs");
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    box.innerHTML = "";
    if (!msgs.length) {
      const e = el("div", "muted");
      e.style.cssText = "text-align:center;padding:30px 10px";
      e.textContent = isAdmin ? "No messages yet." : "Write to the Admin here. Only the Admin can read this chat.";
      box.appendChild(e);
      return;
    }
    msgs.forEach(m => box.appendChild(rowFor(m)));
    if (stick || near) box.scrollTop = box.scrollHeight;
  }

  function rowFor(m) {
    const row = el("div", "supRow " + (mine(m) ? "me" : "them"));
    row.dataset.mid = m.id;
    const bub = el("div", "supBub");

    if (m.replyTo) {
      const q = el("div", "supQuote");
      const qb = el("b"); qb.textContent = whoName(m.replySender);
      const qs = el("span"); qs.textContent = m.replyText || "Original message";
      q.append(qb, qs);
      q.onclick = () => jumpTo(m.replyTo);
      bub.appendChild(q);
    }
    const t = el("div"); t.textContent = m.text;
    bub.appendChild(t);

    const acts = el("div", "supActs");
    const cp = el("button"); cp.textContent = "Copy"; cp.onclick = () => copy(m.text, cp);
    const rp = el("button"); rp.textContent = "Reply"; rp.onclick = () => startReply(m);
    const tm = el("i"); tm.textContent = clock(m.ts);
    acts.append(cp, rp, tm);

    row.append(bub, acts);
    swipeToReply(row, m);
    return row;
  }

  function swipeToReply(row, m) {
    let x0 = 0, y0 = 0, dx = 0, on = false;
    row.addEventListener("touchstart", e => {
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; on = true;
      row.style.transition = "";
    }, { passive: true });
    row.addEventListener("touchmove", e => {
      if (!on) return;
      const t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 10) { on = false; row.style.transform = ""; return; }
      if (mx > 0) { dx = Math.min(mx, 80); row.style.transform = "translateX(" + dx + "px)"; }
    }, { passive: true });
    row.addEventListener("touchend", () => {
      row.style.transition = "transform .15s";
      row.style.transform = "";
      const fire = on && dx > 55;
      on = false; dx = 0;
      if (fire) startReply(m);
    });
  }

  function jumpTo(id) {
    const t = $("supMsgs").querySelector('[data-mid="' + id + '"]');
    if (!t) return;
    t.scrollIntoView({ behavior: "smooth", block: "center" });
    t.classList.add("flash");
    setTimeout(() => t.classList.remove("flash"), 1500);
  }

  function startReply(m) {
    replyTo = { id: m.id };
    $("supReplyWho").textContent = whoName(m.sender);
    $("supReplyTxt").textContent = m.text;
    $("supReplyBar").style.display = "flex";
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
    $("supText").focus();
  }

  function clearReply() {
    replyTo = null;
    const b = $("supReplyBar");
    if (b) b.style.display = "none";
  }

  async function sendMsg() {
    const ta = $("supText");
    const text = ta.value.trim();
    if (!text) return;
    const btn = $("supSend");
    btn.disabled = true;
    try {
      await call("/api/support/send", { text, replyTo: replyTo ? replyTo.id : null, user: threadUser });
      ta.value = ""; ta.style.height = "";
      clearReply();
      await loadThread(true);
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; }
  }

  /* ---------- admin invite link (Settings) ---------- */
  function inviteCard() {
    const box = document.querySelector("#settingsModal .modalBox");
    if (!box || $("supInvite")) return;
    const c = el("div", "card");
    c.id = "supInvite"; c.style.marginBottom = "14px";
    c.innerHTML =
      '<h3>Invite friends</h3>' +
      '<p class="muted">Create a private link that works for 7 days. It only lets people create a normal account.</p>' +
      '<button class="primary" id="supGen">Generate Invite Link</button>' +
      '<div id="supInvOut" style="display:none;margin-top:12px">' +
      '<input id="supInvLink" readonly>' +
      '<div class="flex" style="margin-top:8px"><button class="secondary" id="supInvCopy">Copy link</button>' +
      '<button class="secondary" id="supInvShare">Share</button></div></div>';
    const anchor = $("ojoolaOwner") || $("ojoolaAccount");
    anchor ? anchor.after(c) : box.appendChild(c);

    $("supGen").onclick = async function () {
      const b = this; b.disabled = true;
      try {
        const d = await call("/api/invite/create", {});
        $("supInvLink").value = location.origin + "/login.html?invite=" + d.code;
        $("supInvOut").style.display = "block";
      } catch (e) { alert(e.message); }
      finally { b.disabled = false; }
    };
    $("supInvCopy").onclick = function () { copy($("supInvLink").value, this); };
    $("supInvShare").onclick = async function () {
      const url = $("supInvLink").value;
      if (navigator.share) { try { await navigator.share({ title: "Join Ọjọ́ọ̀la", text: "Join me on Ọjọ́ọ̀la, an AI study partner.", url }); } catch (_) {} }
      else copy(url, this);
    };
  }

  /* ---------- build the screen ---------- */
  function init() {
    const st = el("style"); st.textContent = CSS; document.head.appendChild(st);

    /* bell beside "Welcome back" */
    const h1 = document.querySelector("#homeView .homeHero h1");
    if (h1 && !$("supBell")) {
      const row = el("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;margin:0 0 6px";
      h1.parentNode.insertBefore(row, h1);
      h1.style.margin = "0";
      row.appendChild(h1);
      const bell = el("button", "supBell");
      bell.id = "supBell";
      bell.setAttribute("aria-label", isAdmin ? "Messages" : "Contact the Admin");
      bell.innerHTML = '🔔<span class="supBadge" id="supBadge"></span>';
      bell.onclick = openOverlay;
      row.appendChild(bell);
      const hint = el("div", "supHint");
      hint.id = "supHint";
      row.after(hint);
    }

    /* full screen chat */
    const ov = el("div");
    ov.id = "supOverlay";
    ov.innerHTML =
      '<div class="supTop"><button class="iconBtn" id="supBack" aria-label="Back">←</button><h2 id="supTitle"></h2></div>' +
      '<div id="supInboxWrap"></div>' +
      '<div id="supThread" style="display:none;flex-direction:column;flex:1;min-height:0">' +
      '<div class="supMsgs" id="supMsgs"></div>' +
      '<div class="supComposer">' +
      '<div class="supReplyBar" id="supReplyBar"><div style="flex:1;min-width:0"><b id="supReplyWho"></b><span id="supReplyTxt"></span></div><button id="supReplyX" aria-label="Cancel reply">✕</button></div>' +
      '<div class="inputRow"><textarea id="supText" rows="1" placeholder="Write a message..."></textarea>' +
      '<button class="sendBtn" id="supSend" aria-label="Send">➤</button></div>' +
      '</div></div>';
    document.body.appendChild(ov);

    $("supBack").onclick = back;
    $("supReplyX").onclick = clearReply;
    $("supSend").onclick = sendMsg;
    const ta = $("supText");
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.5) + "px";
    });

    if (isAdmin) inviteCard();

    refresh(true);
    setInterval(refresh, 20000);
    setInterval(() => { if (isOpen && (!isAdmin || threadUser) && !document.hidden) loadThread(false); }, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(true); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

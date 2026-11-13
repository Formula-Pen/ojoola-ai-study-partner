/* Ojoola owner inbox. Adds a Messages tab to admin.html. */
(function () {
  "use strict";
  if (window.__ojoolaAdminMsgs) return;
  window.__ojoolaAdminMsgs = true;
  const embedded = window.top !== window;     // inside the app: the app itself raises alerts

  const css = document.createElement("style");
  css.textContent = [
    ".mb{display:inline-block;min-width:18px;padding:2px 6px;border-radius:99px;background:#dc2626;color:#fff;font-size:11px;font-weight:800;margin-left:4px}",
    ".mTop{display:flex;gap:8px;margin-bottom:12px}",
    ".mTop select{flex:1;border:1.5px solid var(--line);border-radius:13px;padding:12px;background:var(--card);color:var(--text);font:inherit}",
    ".mTh{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:8px;color:inherit}",
    ".mTh .nm{flex:1;min-width:0}",
    ".mTh .nm b,.mTh .nm span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mTh .nm span{font-size:12px;color:var(--muted)}",
    ".mHead{display:flex;align-items:center;gap:10px}",
    ".mMsgs{height:min(55vh,460px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--card);border:1px solid var(--line);border-radius:16px;margin:10px 0}",
    ".mm{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".mm.admin{align-self:flex-end;background:var(--blue);color:#fff}",
    ".mm.user{align-self:flex-start;background:var(--soft);color:var(--text)}",
    ".mm small{display:block;opacity:.7;font-size:10px;margin-top:4px}",
    ".mm .q{border-left:3px solid rgba(128,128,128,.7);padding-left:8px;margin-bottom:6px;font-size:12px;opacity:.85}",
    ".mReplyTo{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted);padding:4px 2px 8px}",
    ".mReplyTo button{border:0;background:none;color:inherit}",
    ".mBar{display:flex;gap:8px;align-items:flex-end}",
    ".mBar textarea{flex:1;border:1.5px solid var(--line);border-radius:13px;padding:12px;background:var(--card);color:var(--text);font:inherit;resize:none;max-height:40vh}"
  ].join("\n");
  document.head.appendChild(css);

  const tabs = document.querySelector(".tabs"), wrap = document.querySelector(".wrap");
  if (!tabs || !wrap) return;

  const tBtn = document.createElement("button");
  tBtn.id = "tMsg";
  tBtn.innerHTML = 'Messages <span id="mBadge" class="mb hidden">0</span>';
  tabs.appendChild(tBtn);

  const pane = document.createElement("div");
  pane.id = "msgPane";
  pane.className = "hidden";
  pane.innerHTML =
    '<div id="mList">' +
    '<div class="mTop"><select id="mNew"><option value="">Start a conversation…</option></select><button class="b" id="mAlerts">🔔 Alerts</button></div>' +
    '<div id="mThreads"></div></div>' +
    '<div id="mThread" class="hidden">' +
    '<div class="mHead"><button class="b" id="mBack">← Back</button><b id="mWho"></b></div>' +
    '<div id="mMsgs" class="mMsgs"></div>' +
    '<div id="mReplyTo" class="mReplyTo hidden"></div>' +
    '<div class="mBar"><textarea id="mInput" rows="1" placeholder="Write a reply…"></textarea><button class="primary" id="mSend" style="width:auto;margin:0;padding:13px 18px">Send</button></div>' +
    '</div>';
  wrap.appendChild(pane);

  let cur = null, replyTo = null, stick = true, lastUnread = null;

  function setBadge(n) {
    const b = document.getElementById("mBadge");
    b.textContent = n > 99 ? "99+" : String(n);
    b.classList.toggle("hidden", !n);
    document.title = (n ? "(" + n + ") " : "") + "Owner dashboard – Ọjọ́ọ̀la";
  }

  function beep() {
    try {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); setTimeout(() => { o.stop(); c.close(); }, 180);
    } catch (_) {}
  }
  function notify(title, body) {
    toast(title + ": " + body);
    beep();
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (_) {}
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      const o = { body, icon: "icons/icon-192.png", tag: "ojoola-support" };
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistration()
          .then(r => r ? r.showNotification(title, o) : new Notification(title, o)).catch(() => {});
      } else { try { new Notification(title, o); } catch (_) {} }
    }
  }
  document.getElementById("mAlerts").onclick = async () => {
    if (!("Notification" in window)) { toast("This browser does not support alerts."); return; }
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "Alerts are on." : "Alerts are blocked in your browser settings.");
  };

  function renderList(threads) {
    const box = document.getElementById("mThreads");
    box.innerHTML = "";
    if (!threads.length) { box.innerHTML = '<div class="empty">No messages yet.</div>'; }
    threads.forEach(t => {
      const b = document.createElement("button");
      b.className = "mTh";
      const name = t.name || "Deleted user";
      b.innerHTML = '<div class="av"></div><div class="nm"><b></b><span></span></div><div class="t"></div>';
      b.querySelector(".av").textContent = name[0].toUpperCase();
      b.querySelector("b").textContent = name + (t.username ? "  @" + t.username : "");
      b.querySelector("span").textContent = t.lastText || "";
      b.querySelector(".t").innerHTML = (t.unread ? '<span class="mb">' + t.unread + "</span> " : "") + '<span style="font-size:11px;color:var(--muted)">' + when(t.lastTs) + "</span>";
      b.onclick = () => openThread(t.userId, name);
      box.appendChild(b);
    });
    const sel = document.getElementById("mNew");
    const keep = sel.value;
    sel.innerHTML = '<option value="">Start a conversation…</option>';
    (typeof users !== "undefined" ? users : []).forEach(u => {
      const o = document.createElement("option");
      o.value = u.id;
      o.textContent = u.firstName + " (@" + u.username + ")";
      sel.appendChild(o);
    });
    sel.value = keep;
  }

  async function loadList() {
    try {
      const s = await api("/api/support/summary");
      setBadge(s.unread || 0);
      renderList(s.threads || []);
    } catch (e) { toast(e.message); }
  }

  function renderThread(d) {
    const box = document.getElementById("mMsgs");
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = "";
    const list = d.messages || [];
    if (!list.length) box.innerHTML = '<div class="empty">No messages yet. Write the first one below.</div>';
    list.forEach(m => {
      const el = document.createElement("div");
      el.className = "mm " + m.sender;
      if (m.replyText) {
        const q = document.createElement("div");
        q.className = "q";
        q.textContent = (m.replySender === "admin" ? "You" : "Student") + ": " + m.replyText;
        el.appendChild(q);
      }
      const t = document.createElement("div");
      t.textContent = m.text;
      el.appendChild(t);
      const s = document.createElement("small");
      s.textContent = when(m.ts) + " · tap to reply";
      el.appendChild(s);
      el.onclick = () => setReply(m);
      box.appendChild(el);
    });
    if (stick || near) box.scrollTop = box.scrollHeight;
    stick = false;
  }

  async function refreshThread() {
    if (!cur) return;
    try { renderThread(await api("/api/support/thread?user=" + cur.id)); } catch (e) { toast(e.message); }
  }

  function openThread(id, name) {
    cur = { id: Number(id), name };
    document.getElementById("mWho").textContent = name;
    document.getElementById("mList").classList.add("hidden");
    document.getElementById("mThread").classList.remove("hidden");
    clearReply();
    stick = true;
    refreshThread().then(loadList);
  }
  document.getElementById("mBack").onclick = () => {
    cur = null;
    document.getElementById("mThread").classList.add("hidden");
    document.getElementById("mList").classList.remove("hidden");
    loadList();
  };
  document.getElementById("mNew").onchange = e => {
    const id = e.target.value;
    if (!id) return;
    const u = (typeof users !== "undefined" ? users : []).find(x => String(x.id) === id);
    openThread(id, u ? u.firstName : "User");
    e.target.value = "";
  };

  function setReply(m) {
    replyTo = m.id;
    const r = document.getElementById("mReplyTo");
    r.textContent = "";
    const t = document.createElement("span");
    t.textContent = "Replying to: " + String(m.text).slice(0, 60);
    const x = document.createElement("button");
    x.textContent = "✕";
    x.onclick = clearReply;
    r.appendChild(t); r.appendChild(x);
    r.classList.remove("hidden");
  }
  function clearReply() {
    replyTo = null;
    document.getElementById("mReplyTo").classList.add("hidden");
  }

  document.getElementById("mSend").onclick = async () => {
    const inp = document.getElementById("mInput"), text = inp.value.trim();
    if (!text || !cur) return;
    const btn = document.getElementById("mSend");
    btn.disabled = true;
    try {
      await api("/api/support/send", { user: cur.id, text, replyTo });
      inp.value = ""; inp.style.height = "auto";
      clearReply(); stick = true;
      await refreshThread();
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  };
  const inp = document.getElementById("mInput");
  inp.addEventListener("input", () => {
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, window.innerHeight * 0.4) + "px";
  });

  function showMsgs() {
    $("tUsers").classList.remove("on");
    $("tAct").classList.remove("on");
    tBtn.classList.add("on");
    $("usersPane").classList.add("hidden");
    $("actPane").classList.add("hidden");
    pane.classList.remove("hidden");
    loadList();
  }
  tBtn.onclick = showMsgs;
  const u0 = $("tUsers").onclick, a0 = $("tAct").onclick;
  $("tUsers").onclick = () => { tBtn.classList.remove("on"); pane.classList.add("hidden"); if (u0) u0(); };
  $("tAct").onclick = () => { tBtn.classList.remove("on"); pane.classList.add("hidden"); if (a0) a0(); };

  async function tick() {
    if ($("dashView").classList.contains("hidden")) return;
    try {
      const s = await api("/api/support/summary");
      const n = s.unread || 0;
      const viewing = !pane.classList.contains("hidden") && cur;
      if (lastUnread !== null && n > lastUnread && !embedded && !viewing) {
        const t = (s.threads || []).find(x => x.unread);
        notify("New message", (t && t.name ? t.name + ": " : "") + (t ? t.lastText : "You have a new message"));
      }
      lastUnread = n;
      setBadge(n);
      if (!pane.classList.contains("hidden")) {
        if (cur) await refreshThread(); else renderList(s.threads || []);
      }
    } catch (_) {}
  }
  setInterval(tick, 15000);
  setTimeout(tick, 1500);
})();

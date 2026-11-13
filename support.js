/* Ojoola support chat. Loaded by ojoola-core.js after sign-in. */
(function () {
  "use strict";
  const core = window.OjoolaCore;
  if (!core || !core.me || window.__ojoolaSupport) return;
  window.__ojoolaSupport = true;

  const API = core.api;
  const isAdmin = core.me.role === "admin";
  let lastUnread = null, panelOpen = false, replyTo = null, stick = true, threadTimer = null;
  let fab = null, panel = null;

  async function call(path, body) {
    const r = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + core.token() },
      body: body ? JSON.stringify(body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Request failed");
    return d;
  }

  function toast(t) {
    const e = document.createElement("div");
    e.textContent = t;
    e.style.cssText = "position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);max-width:88vw;background:#14213d;color:#fff;padding:11px 16px;border-radius:14px;font:14px Arial,sans-serif;z-index:100000;box-shadow:0 8px 24px rgba(0,0,0,.3)";
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 4000);
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
          .then(r => r ? r.showNotification(title, o) : new Notification(title, o))
          .catch(() => {});
      } else { try { new Notification(title, o); } catch (_) {} }
    }
  }

  async function enableAlerts() {
    if (!("Notification" in window)) { toast("This browser does not support alerts."); return; }
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "Alerts are on." : "Alerts are blocked in your browser settings.");
  }

  function ago(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 1440) return Math.floor(m / 60) + " h ago";
    return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function setBadge(n) {
    if (fab) {
      const b = fab.querySelector(".ojSBadge");
      b.textContent = n > 99 ? "99+" : String(n);
      b.style.display = n ? "flex" : "none";
    }
    const nav = document.getElementById("navOwner");
    if (isAdmin && nav) {
      let b = nav.querySelector(".ojSBadge2");
      if (!b) {
        b = document.createElement("span");
        b.className = "ojSBadge2";
        b.style.cssText = "margin-left:4px;background:#dc2626;color:#fff;border-radius:99px;padding:1px 6px;font-size:10px;font-weight:800";
        nav.appendChild(b);
      }
      b.textContent = String(n);
      b.style.display = n ? "inline-block" : "none";
    }
  }

  async function poll() {
    try {
      const s = await call("/api/support/summary");
      const n = s.unread || 0;
      if (lastUnread !== null && n > lastUnread) {
        if (isAdmin) {
          const t = (s.threads || []).find(x => x.unread);
          notify("New message", (t && t.name ? t.name + ": " : "") + (t ? t.lastText : "You have a new message"));
        } else if (!panelOpen) {
          notify("Admin replied", "You have a new message from the admin");
        }
      }
      lastUnread = n;
      setBadge(n);
    } catch (_) {}
  }

  function setReply(m) {
    replyTo = m.id;
    const r = document.getElementById("ojSReply");
    r.textContent = "";
    const t = document.createElement("span");
    t.textContent = "Replying to: " + String(m.text).slice(0, 60);
    const x = document.createElement("button");
    x.textContent = "✕";
    x.onclick = clearReply;
    r.appendChild(t); r.appendChild(x);
    r.classList.remove("ojHide");
  }
  function clearReply() {
    replyTo = null;
    const r = document.getElementById("ojSReply");
    if (r) r.classList.add("ojHide");
  }

  function renderThread(list) {
    const sig = list.map(m => m.id).join(",");
    const b0 = document.getElementById("ojSMsgs");
    if (sig === lastSig && b0.childElementCount) return;
    lastSig = sig;
    const box = document.getElementById("ojSMsgs");
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = "";
    if (!list.length) {
      const e = document.createElement("div");
      e.className = "ojSEmpty";
      e.textContent = "No messages yet. Write to the admin and replies will appear here..";
      box.appendChild(e);
    }
    list.forEach(m => {
      const el = document.createElement("div");
      el.className = "ojSMsg " + (m.sender === "user" ? "me" : "them");
      if (m.replyText) {
        const q = document.createElement("div");
        q.className = "ojSQ";
        q.textContent = (m.replySender === "admin" ? "Admin" : "You") + ": " + m.replyText;
        el.appendChild(q);
      }
      const t = document.createElement("div");
      t.textContent = m.audioSecs ? "" : m.text; if (m.audioSecs) { el.classList.add("vn"); t.appendChild(playerFor(m)); }
      el.appendChild(t);
      const s = document.createElement("small");
      s.textContent = ago(m.ts) + " · tap to reply";
      el.appendChild(s);
      el.onclick = () => setReply(m);
      box.appendChild(el);
    });
    if (stick || near) box.scrollTop = box.scrollHeight;
    stick = false;
  }

  /* ---- voice notes ---- */
let lastSig = "", rec = null, curAudio = null;
const playerCache = {};

function fmt(s) {
  s = Math.max(0, Math.floor(s || 0));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function makePlayer(load, secs) {
  const el = document.createElement("div");
  el.className = "ojVP";
  el.innerHTML = '<button type="button" class="ojVB">↶10</button><button type="button" class="ojVB ojVPlay">▶</button><button type="button" class="ojVB">10↷</button><input type="range" min="0" max="100" value="0"><span>0:00 / ' + fmt(secs) + '</span>';
  const btns = el.querySelectorAll("button");
  const back = btns[0], play = btns[1], fwd = btns[2];
  const seek = el.querySelector("input"), time = el.querySelector("span");
  let a = null;
  const dur = () => (a && isFinite(a.duration) && a.duration > 0 ? a.duration : secs || 0);
  const paint = () => {
    const d = dur(), t = a ? a.currentTime : 0;
    play.textContent = a && !a.paused ? "❚❚" : "▶";
    seek.value = d ? Math.min(100, t / d * 100) : 0;
    time.textContent = fmt(t) + " / " + fmt(d);
  };
  async function audio() {
    if (a) return a;
    const x = new Audio(await load());
    ["play", "pause", "ended", "timeupdate"].forEach(ev => x.addEventListener(ev, paint));
    x.addEventListener("loadedmetadata", () => {
      if (x.duration === Infinity) {
        const fix = () => { x.removeEventListener("timeupdate", fix); x.currentTime = 0; };
        x.addEventListener("timeupdate", fix);
        x.currentTime = 1e101;
      }
    });
    a = x;
    return a;
  }
  const oops = () => toast("Couldn't play the voice note. Please try again.");
  play.onclick = async () => {
    try {
      const x = await audio();
      if (x.paused) {
        if (curAudio && curAudio !== x) curAudio.pause();
        curAudio = x;
        await x.play();
      } else x.pause();
    } catch (_) { oops(); }
  };
  back.onclick = async () => { try { const x = await audio(); x.currentTime = Math.max(0, x.currentTime - 10); paint(); } catch (_) { oops(); } };
  fwd.onclick = async () => { try { const x = await audio(); x.currentTime = Math.min(dur(), x.currentTime + 10); paint(); } catch (_) { oops(); } };
  seek.oninput = async () => { try { const x = await audio(); x.currentTime = seek.value / 100 * dur(); paint(); } catch (_) { oops(); } };
  el.onclick = e => e.stopPropagation();
  return el;
}

function playerFor(m) {
  if (!playerCache[m.id]) {
    playerCache[m.id] = makePlayer(async () => {
      const r = await fetch(API + "/api/support/audio?id=" + m.id, { headers: { Authorization: "Bearer " + core.token() } });
      if (!r.ok) throw new Error("load");
      return URL.createObjectURL(await r.blob());
    }, m.audioSecs);
  }
  return playerCache[m.id];
}

function recBox() { return document.getElementById("ojSRec"); }

function showBar(on) {
  const main = document.querySelector(".ojSBar");
  if (main) main.classList.toggle("ojHide", !on);
  recBox().classList.toggle("ojHide", on);
  if (on) recBox().innerHTML = "";
}

async function startRec() {
  if (rec) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast("Voice notes aren't supported on this browser."); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (_) { toast("Please allow microphone access to send a voice note."); return; }
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || "";
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
  const chunks = [];
  rec = { mr, stream, chunks, start: Date.now(), timer: null, cancel: false, mime: mr.mimeType || mime || "audio/webm" };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = finishRec;
  mr.start(1000);
  const box = recBox();
  box.innerHTML = '<span style="color:#dc2626;font-size:18px">●</span><b id="ojRecTime">0:00</b><span style="flex:1"></span>';
  const del = document.createElement("button");
  del.type = "button"; del.className = "ojDel"; del.textContent = "🗑";
  del.onclick = () => stopRec(true);
  const stop = document.createElement("button");
  stop.type = "button"; stop.textContent = "■";
  stop.onclick = () => stopRec(false);
  box.append(del, stop);
  showBar(false);
  rec.timer = setInterval(() => {
    if (!rec) return;
    const s = Math.floor((Date.now() - rec.start) / 1000);
    const t = document.getElementById("ojRecTime");
    if (t) t.textContent = fmt(s);
    if (s >= 120) stopRec(false);
  }, 500);
}

function stopRec(cancel) {
  if (!rec) return;
  rec.cancel = !!cancel;
  clearInterval(rec.timer);
  try { rec.mr.stop(); } catch (_) { finishRec(); }
}

function finishRec() {
  const r = rec;
  if (!r) return;
  rec = null;
  clearInterval(r.timer);
  r.stream.getTracks().forEach(t => t.stop());
  if (r.cancel) { showBar(true); return; }
  const secs = Math.max(1, Math.round((Date.now() - r.start) / 1000));
  const blob = new Blob(r.chunks, { type: r.mime });
  if (blob.size < 800) { toast("That was too short. Please try again."); showBar(true); return; }
  showPreview(blob, secs, r.mime);
}

function showPreview(blob, secs, mime) {
  const box = recBox();
  box.innerHTML = "";
  const p = makePlayer(async () => URL.createObjectURL(blob), secs);
  const del = document.createElement("button");
  del.type = "button"; del.className = "ojDel"; del.textContent = "🗑";
  const snd = document.createElement("button");
  snd.type = "button"; snd.textContent = "➤";
  box.append(p, del, snd);
  showBar(false);
  del.onclick = () => { if (curAudio) curAudio.pause(); showBar(true); };
  snd.onclick = async () => {
    snd.disabled = true;
    if (curAudio) curAudio.pause();
    try {
      const b64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",")[1] || "");
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      await call("/api/support/send", { audio: b64, mime, secs, replyTo });
      showBar(true); clearReply(); stick = true; lastSig = "";
      await loadThread();
    } catch (e) {
      toast(/fetch|network|load failed/i.test(String(e.message)) ? "Couldn't send. Please check your connection and try again." : e.message);
      snd.disabled = false;
    }
  };
}

document.addEventListener("click", e => {
  if (e.target.closest && e.target.closest("#ojSMic")) startRec();
});

async function loadThread() {
    try { const d = await call("/api/support/thread"); renderThread(d.messages || []); }
    catch (e) { toast(e.message); }
  }

  async function sendMsg() {
    const inp = document.getElementById("ojSInput");
    const text = inp.value.trim();
    if (!text) return;
    const btn = document.getElementById("ojSSend");
    btn.disabled = true;
    try {
      await call("/api/support/send", { text, replyTo });
      inp.value = ""; inp.style.height = "auto";
      clearReply(); stick = true;
      await loadThread();
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  }

  function openPanel() {
    panelOpen = true;
    panel.classList.remove("ojHide");
    core.track("support_open");
    stick = true;
    loadThread();
    threadTimer = setInterval(loadThread, 6000);
  }
  function closePanel() { if (rec) stopRec(true); if (curAudio) curAudio.pause();
    panelOpen = false;
    panel.classList.add("ojHide");
    clearInterval(threadTimer); threadTimer = null;
    poll();
  }

  function buildUI() {
    const css = document.createElement("style");
    css.textContent = [
      ".ojHide{display:none!important}",
      ".ojSFab{position:fixed;left:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);z-index:28;width:50px;height:50px;border:0;border-radius:50%;background:#2563eb;color:#fff;font-size:22px;box-shadow:0 8px 22px rgba(37,99,235,.4)}",
      ".ojSBadge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#dc2626;color:#fff;font:800 11px Arial;display:none;align-items:center;justify-content:center}",
      ".ojS{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.5);display:flex;align-items:flex-end}",
      ".ojSBox{width:100%;max-width:720px;margin:0 auto;height:min(88vh,640px);background:#fff;color:#172033;border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden;font-family:Arial,Helvetica,sans-serif}",
      "body.dark .ojSBox{background:#121c2e;color:#e8edf7}",
      ".ojSHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(128,128,128,.25)}",
      ".ojSHead button{border:0;background:none;font-size:20px;color:inherit;padding:4px 8px}",
      ".ojSMsgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}",
      ".ojSEmpty{margin:auto;text-align:center;color:#64748b;font-size:14px;padding:20px}",
      ".ojSMsg{max-width:82%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}",
      ".ojSMsg.me{align-self:flex-end;background:#2563eb;color:#fff}",
      ".ojSMsg.them{align-self:flex-start;background:#eaf0ff;color:#172033}",
      "body.dark .ojSMsg.them{background:#1d3158;color:#e8edf7}",
      ".ojSMsg small{display:block;opacity:.7;font-size:10px;margin-top:4px}",
      ".ojSQ{border-left:3px solid rgba(128,128,128,.7);padding-left:8px;margin-bottom:6px;font-size:12px;opacity:.85}",
      ".ojSReply{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;font-size:12px;background:rgba(128,128,128,.12)}",
      ".ojSReply button{border:0;background:none;color:inherit;font-size:14px}",
      ".ojSBar{display:flex;gap:8px;align-items:flex-end;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px);border-top:1px solid rgba(128,128,128,.25)}",
      ".ojSBar textarea{flex:1;border:1px solid #dce3ee;border-radius:14px;padding:12px;font:inherit;resize:none;max-height:40vh;background:#fff;color:#172033}",
      "body.dark .ojSBar textarea{background:#0e1727;color:#e8edf7;border-color:#334155}",
      ".ojSBar button{width:50px;height:46px;border:0;border-radius:14px;background:#2563eb;color:#fff;font-size:18px}",
      ".ojSBar button:disabled{opacity:.6}",
".ojSBox{height:min(88vh,640px);height:min(88dvh,640px)}",
".ojSMsgs{min-height:0}",
".ojSBar,.ojSRec{flex:0 0 auto}",
".ojSBar #ojSMic{background:#eaf0ff;color:#2563eb}",
".ojSRec{display:flex;align-items:center;gap:8px;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px);border-top:1px solid rgba(128,128,128,.25)}",
".ojSRec button{width:46px;height:46px;flex:0 0 46px;border:0;border-radius:14px;background:#2563eb;color:#fff;font-size:18px}",
".ojSRec button.ojDel{background:#fee2e2;color:#b91c1c}",
".ojSRec .ojVP{flex:1}",
".ojVP{display:flex;align-items:center;gap:4px;min-width:0}",
".ojVP .ojVB{width:auto;height:30px;flex:0 0 auto;padding:0 7px;border:0;border-radius:10px;background:rgba(128,128,128,.25);color:inherit;font-size:11px}",
".ojVP .ojVPlay{width:34px;padding:0;font-size:14px}",
".ojVP input{flex:1;min-width:50px;width:auto;padding:0;border:0;background:transparent;box-shadow:none;accent-color:#60a5fa}",
".ojVP span{font-size:10px;opacity:.85;min-width:64px;text-align:center}",
".ojSMsg.vn{min-width:min(300px,80vw)}"
    ].join("\n");
    document.head.appendChild(css);

    fab = document.createElement("button");
    fab.className = "ojSFab";
    fab.setAttribute("aria-label", "Message the admin");
    fab.innerHTML = '💬<span class="ojSBadge">0</span>';
    fab.onclick = openPanel;
    document.body.appendChild(fab);

    panel = document.createElement("div");
    panel.className = "ojS ojHide";
    panel.innerHTML =
      '<div class="ojSBox">' +
      '<div class="ojSHead"><b>Message the admin</b><span><button id="ojSBell" title="Turn on alerts">🔔</button><button id="ojSClose" title="Close">✕</button></span></div>' +
      '<div id="ojSMsgs" class="ojSMsgs"></div>' +
      '<div id="ojSReply" class="ojSReply ojHide"></div>' +
      '<div class="ojSBar"><textarea id="ojSInput" rows="1" placeholder="Write a message…"></textarea><button id="ojSMic" type="button" title="Voice note">🎤</button><button id="ojSSend">➤</button></div>' + '<div id="ojSRec" class="ojSRec ojHide"></div>' +
      '</div>';
    document.body.appendChild(panel);

    document.getElementById("ojSClose").onclick = closePanel;
    document.getElementById("ojSBell").onclick = enableAlerts;
    document.getElementById("ojSSend").onclick = sendMsg;
    panel.addEventListener("click", e => { if (e.target === panel) closePanel(); });
    const inp = document.getElementById("ojSInput");
    inp.addEventListener("input", () => {
      inp.style.height = "auto";
      inp.style.height = Math.min(inp.scrollHeight, window.innerHeight * 0.4) + "px";
    });
  }

  if (!isAdmin) buildUI();
  poll();
  setInterval(poll, 20000);
})();

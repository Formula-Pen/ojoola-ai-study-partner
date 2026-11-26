(function () {
  "use strict";
  var VAPID = "BJyimnWNQ1Bln8LSdils5jeB8GM3UjKltyqv9NAWp3lBP-b4P83N4JZZsR-Bi_F7VBG1M7TxUd66x_uTNaY9aG8";
  var CFG = {
    apiKey: "AIzaSyB4hQJiZT35WPP8XfR-ui_-jjbztBtka8Q",
    authDomain: "ojoola-ai-study-partner.firebaseapp.com",
    projectId: "ojoola-ai-study-partner",
    storageBucket: "ojoola-ai-study-partner.firebasestorage.app",
    messagingSenderId: "893105726838",
    appId: "1:893105726838:web:729451cede982d72788657"
  };
  var core = window.OjoolaCore;
  if (!core || !("Notification" in window) || !("serviceWorker" in navigator)) return;
  var token = "", statusEl = null, btn = null, copyBtn = null;

  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function ready() {
    if (window.firebase && firebase.messaging) return Promise.resolve();
    var base = "https://www.gstatic.com/firebasejs/10.12.2/";
    return load(base + "firebase-app-compat.js").then(function () {
      return load(base + "firebase-messaging-compat.js");
    });
  }
  async function register() {
    await ready();
    if (!firebase.apps.length) firebase.initializeApp(CFG);
    var reg = await navigator.serviceWorker.ready;
    var m = firebase.messaging();
    token = await m.getToken({ vapidKey: VAPID, serviceWorkerRegistration: reg });
    if (!token) throw new Error("no token");
    m.onMessage(function (p) {
      var n = p.notification || {};
      reg.showNotification(n.title || "Ọjọ́ọ̀la", { body: n.body || "", icon: "icons/icon-192.png" });
    });
    try {
      await fetch(core.api + "/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + core.token() },
        body: JSON.stringify({ token: token })
      });
    } catch (_) {}
    return token;
  }
  function paint() {
    if (!statusEl) return;
    var p = Notification.permission;
    if (p === "granted") {
      statusEl.textContent = "Notifications are on.";
      btn.classList.add("hidden");
    } else if (p === "denied") {
      statusEl.textContent = "Notifications are blocked. Open your phone Settings, then Apps, then Ọjọ́ọ̀la, then Notifications, and allow them.";
      btn.classList.add("hidden");
    } else {
      statusEl.textContent = "Get a notification when something new arrives.";
      btn.classList.remove("hidden");
    }
  }
  function mount() {
    var box = document.querySelector("#settingsModal .modalBox");
    if (!box || !core.me) return false;
    if (document.getElementById("ojoolaPush")) return true;
    var c = document.createElement("div");
    c.id = "ojoolaPush"; c.className = "card"; c.style.marginBottom = "14px";
    c.innerHTML = '<h3>Notifications</h3><p class="muted"></p><button class="primary">Turn on notifications</button> <button class="secondary hidden">Copy test token</button>';
    statusEl = c.querySelector("p");
    btn = c.querySelector(".primary");
    copyBtn = c.querySelector(".secondary");
    btn.onclick = async function () {
      try {
        var r = await Notification.requestPermission();
        if (r === "granted") await register();
      } catch (e) { statusEl.textContent = "Could not turn on notifications. Please try again."; return; }
      paint();
    };
    copyBtn.onclick = function () {
      if (token && navigator.clipboard) navigator.clipboard.writeText(token).then(function () { copyBtn.textContent = "Copied"; });
    };
    var after = document.getElementById("ojoolaOwner") || document.getElementById("ojoolaAccount");
    after ? after.after(c) : box.appendChild(c);
    if (core.me.role === "admin") copyBtn.classList.remove("hidden");
    paint();
    return true;
  }
  var tries = 0;
  var t = setInterval(function () { if (mount() || ++tries > 30) clearInterval(t); }, 500);
  if (Notification.permission === "granted") register().catch(function () {});
})();

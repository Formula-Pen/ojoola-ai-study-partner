/* Ojoola Core — account gate + secure-backend bridge.
   Load as the FIRST script in index.html's <head>:  <script src="ojoola-core.js"></script>
   It needs no other changes to the existing app. */
(function () {
  "use strict";

  /* >>> SET THIS to your deployed Worker address <<< */
  const API = "https://ojoola.babatundexwale.workers.dev";

  const KEY = "ojoola_session";
  const token = () => localStorage.getItem(KEY) || "";
  const core = (window.OjoolaCore = {
    api: API,
    me: null,
    token,
    setSession(t) { localStorage.setItem(KEY, t); },
    can(p) { return !core.me || !core.me.perms || core.me.perms[p] !== false; },
    track(event) {
      if (!token()) return;
      fetch(API + "/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ event }),
        keepalive: true
      }).catch(() => {});
    },
    async logout() {
      try { await fetch(API + "/api/logout", { method: "POST", headers: { Authorization: "Bearer " + token() } }); } catch (_) {}
      localStorage.removeItem(KEY);
      location.replace("login.html");
    }
  });

  if (window.OJOOLA_NO_GATE) return;           // login page: expose helpers only

  /* 1. Gate: no session -> login page */
  if (!token()) {
    location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() || "index.html"));
    return;
  }

  /* 2. The Gemini key no longer lives in the browser. Remove any old copy and
        give the existing app a harmless placeholder so its "is a key saved?" checks pass. */
  localStorage.setItem("ojoola_gemini_key", "managed-by-server");

  /* 3. Route every Gemini / Live call through the secure backend */
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    const url = typeof input === "string" ? input : (input && input.url) || "";
    let ours = false, m;
    const auth = { "Content-Type": "application/json", Authorization: "Bearer " + token() };

    if ((m = url.match(/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:\/?]+):(streamGenerateContent|generateContent)/))) {
      input = API + "/api/gemini?model=" + m[1] + (m[2] === "streamGenerateContent" ? "&stream=1" : "");
      init = Object.assign({}, init, { headers: auth });
      ours = true;
    } else if (url.indexOf("ojoola-live-token") > -1) {
      input = API + "/api/live-token";
      init = Object.assign({}, init, { headers: auth });
      ours = true;
    } else if (url.indexOf(API) === 0) {
      ours = true;
    }
    return realFetch(input, init).then(r => {
      if (ours && r.status === 401) { localStorage.removeItem(KEY); location.replace("login.html"); }
      return r;
    });
  };

  /* 4. Refresh account + permissions */
  fetch(API + "/api/me", { headers: { Authorization: "Bearer " + token() } })
    .then(r => r.ok ? r.json() : null)
    .then(me => { if (me) { core.me = me; applyUI(); } })
    .catch(() => {});

  /* 5. UI: remove API-key area, add account card, hide features the account lacks */
  function applyUI() {
    const keyInput = document.getElementById("apiKeyInput");
    if (keyInput) {
      const card = keyInput.closest(".card");
      const dummy = document.createElement("input");
      dummy.id = "apiKeyInput"; dummy.hidden = true;
      if (card) card.replaceWith(dummy);
    }
    const box = document.querySelector("#settingsModal .modalBox");
    if (box && !document.getElementById("ojoolaAccount")) {
      const who = core.me && core.me.firstName ? core.me.firstName + " (@" + core.me.username + ")" : "Owner";
      const c = document.createElement("div");
      c.id = "ojoolaAccount"; c.className = "card"; c.style.marginBottom = "14px";
      c.innerHTML = '<h3>Account</h3><p class="muted"></p><button class="secondary">Sign out</button>';
      c.querySelector("p").textContent = "Signed in as " + who;
      c.querySelector("button").onclick = () => core.logout();
      const first = box.querySelector(".card");
      first ? box.insertBefore(c, first) : box.appendChild(c);
    }
    const hide = (el) => { if (el) el.style.display = "none"; };
    if (!core.can("live")) document.querySelectorAll('button[onclick="proceedToLiveConversation()"]').forEach(hide);
    if (!core.can("pdf")) {
      hide(document.getElementById("coursePdfInput")?.closest("label"));
      hide(document.getElementById("coursePictureInput")?.closest("label"));
    }
  }
  document.addEventListener("DOMContentLoaded", () => { if (core.me) applyUI(); });

  /* 6. Activity pings + Read Aloud permission (no edits to the app's own code) */
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button");
    if (b && /Read/.test(b.textContent) && b.closest(".messageActions")) {
      if (!core.can("read_aloud")) {
        e.stopImmediatePropagation(); e.preventDefault();
        alert("Read Aloud is not enabled for your account.");
        return;
      }
      core.track("read_aloud");
    }
  }, true);
  document.addEventListener("change", e => {
    if (e.target.id === "coursePdfInput" && e.target.files.length) core.track("pdf_upload");
    if (e.target.id === "coursePictureInput" && e.target.files.length) core.track("picture_upload");
  }, true);
})();

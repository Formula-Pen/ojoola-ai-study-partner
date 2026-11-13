/* Ojoola Core: account gate + secure-backend bridge.
   Load as the FIRST script in index.html's <head>:  <script src="ojoola-core.js"></script>
   It needs no other changes to the existing app. */
(function () {
  "use strict";

  /* >>> SET THIS to your deployed Worker address <<< */
  const API = "https://ojoola-api.babatundexwale.workers.dev";

  const KEY = "ojoola_session";
  const UID_KEY = "ojoola_uid";
  const token = () => localStorage.getItem(KEY) || "";
  const core = (window.OjoolaCore = {
    api: API,
    me: null,
    token,
    setSession(t, uid) {
      localStorage.setItem(KEY, t);
      if (uid !== undefined && uid !== null) localStorage.setItem(UID_KEY, String(uid));
    },
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
      localStorage.removeItem(UID_KEY);
      location.replace("login.html");
    }
  });

  if (window.OJOOLA_NO_GATE) return;           // login page: expose helpers only

  /* 1. Gate: no session -> login page */
  if (!token()) {
    location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() || "index.html"));
    return;
  }

  /* 1b. Every account gets its own courses, attachments, chats and notes on this phone.
         A session from before this update has no account id saved, so sign in once more. */
  const uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    localStorage.removeItem(KEY);
    location.replace("login.html");
    return;
  }
  scopeStorage(uid);

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
    .then(r => {
      if (r.status === 403) {                       // suspended or revoked by the owner
        r.json().then(d => sessionStorage.setItem("ojoola_notice", d.error || "Your account is not active. Contact the owner.")).catch(() => {})
          .finally(() => { localStorage.removeItem(KEY); location.replace("login.html"); });
        return null;
      }
      return r.ok ? r.json() : null;
    })
    .then(me => { if (me) { core.me = me; applyUI(); loadSupport(); } })
    .catch(() => {});

  /* Keep each account's data separate on a shared phone */
  function scopeStorage(id) {
    const pre = "ojoola_acct_" + id + "__";
    const DATA = ["ojoola_courses", "ojoola_general_chat", "ojoola_file_notes", "ojoola_live_notes"];
    const isData = k => DATA.indexOf(String(k)) > -1;
    const P = Storage.prototype;
    const lenGet = Object.getOwnPropertyDescriptor(P, "length").get;
    const raw = { get: P.getItem, set: P.setItem, del: P.removeItem, key: P.key, clear: P.clear };

    P.getItem = function (k) {
      return this === localStorage && isData(k) ? raw.get.call(this, pre + k) : raw.get.call(this, k);
    };
    P.setItem = function (k, v) {
      return this === localStorage && isData(k) ? raw.set.call(this, pre + k, v) : raw.set.call(this, k, v);
    };
    P.removeItem = function (k) {
      return this === localStorage && isData(k) ? raw.del.call(this, pre + k) : raw.del.call(this, k);
    };

    /* the app scans every stored key to recover old data, so show it only this account's keys */
    const visible = () => {
      const out = [];
      const n = lenGet.call(localStorage);
      for (let i = 0; i < n; i++) {
        const k = raw.key.call(localStorage, i);
        if (k === null) continue;
        if (k.indexOf(pre) === 0) out.push(k.slice(pre.length));
        else if (k.indexOf("ojoola_acct_") === 0) continue;   // another account
        else if (isData(k)) continue;                          // old shared copy
        else out.push(k);
      }
      return out;
    };
    P.key = function (i) {
      if (this !== localStorage) return raw.key.call(this, i);
      const v = visible()[i];
      return v === undefined ? null : v;
    };
    Object.defineProperty(P, "length", {
      configurable: true,
      get() { return this === localStorage ? visible().length : lenGet.call(this); }
    });

    /* "Clear local app data" only clears this account */
    P.clear = function () {
      if (this !== localStorage) return raw.clear.call(this);
      const del = [];
      const n = lenGet.call(this);
      for (let i = 0; i < n; i++) {
        const k = raw.key.call(this, i);
        if (k !== null && k.indexOf(pre) === 0) del.push(k);
      }
      del.forEach(k => raw.del.call(this, k));
    };

    /* attachments live in IndexedDB, so give each account its own database */
    if (window.IDBFactory) {
      const F = IDBFactory.prototype;
      const oOpen = F.open, oDel = F.deleteDatabase;
      const scoped = name => (name === "ojoola_files" ? "ojoola_files_acct_" + id : name);
      F.open = function (name, ver) {
        return ver === undefined ? oOpen.call(this, scoped(name)) : oOpen.call(this, scoped(name), ver);
      };
      F.deleteDatabase = function (name) { return oDel.call(this, scoped(name)); };
    }
  }

  /* Load the Contact the Admin chat once the account is known */
  function loadSupport() {
    if (document.getElementById("ojoolaSupportJs")) return;
    const s = document.createElement("script");
    s.id = "ojoolaSupportJs"; s.src = "support.js";
    document.head.appendChild(s);
  }

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

    if (core.me && core.me.role === "admin" && box && !document.getElementById("ojoolaOwner")) {
      const o = document.createElement("div");
      o.id = "ojoolaOwner"; o.className = "card"; o.style.marginBottom = "14px";
      o.innerHTML = '<h3>Owner</h3><button class="primary" onclick="location.href=\'admin.html\'">Open owner dashboard</button>';
      const acc = document.getElementById("ojoolaAccount");
      acc ? acc.after(o) : box.appendChild(o);
    }

    if (core.me && core.me.role === "admin" && !document.getElementById("ownerView")) {
      const main = document.querySelector("main");
      const navInner = document.querySelector("#bottomNav .navInner");
      if (main && navInner) {
        const sec = document.createElement("section");
        sec.id = "ownerView"; sec.className = "wrap hidden";
        sec.innerHTML = '<iframe src="admin.html" title="Owner dashboard" style="width:100%;height:calc(100vh - 170px);min-height:420px;border:0;border-radius:18px"></iframe>';
        main.appendChild(sec);
        const btn = document.createElement("button");
        btn.id = "navOwner"; btn.innerHTML = "🛡<br>Admin";
        btn.onclick = () => {
          ["homeView","generalView","courseInfoView","courseChatView","courseLiveView"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
          sec.classList.remove("hidden");
          document.querySelectorAll("#bottomNav button").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          window.scrollTo(0, 0);
        };
        navInner.appendChild(btn);
        const sp = window.setPage;
        if (typeof sp === "function") window.setPage = function () { sec.classList.add("hidden"); btn.classList.remove("active"); return sp.apply(this, arguments); };
      }
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

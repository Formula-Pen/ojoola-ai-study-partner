const CACHE_NAME = "ojoola-v25";
try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
  firebase.initializeApp({
    apiKey: "AIzaSyB4hQJiZT35WPP8XfR-ui_-jjbztBtka8Q",
    authDomain: "ojoola-ai-study-partner.firebaseapp.com",
    projectId: "ojoola-ai-study-partner",
    storageBucket: "ojoola-ai-study-partner.firebasestorage.app",
    messagingSenderId: "893105726838",
    appId: "1:893105726838:web:729451cede982d72788657"
  });
  firebase.messaging();
} catch (e) {}
try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
  firebase.initializeApp({
    apiKey: "PASTE_HERE",
    authDomain: "PASTE_HERE",
    projectId: "PASTE_HERE",
    messagingSenderId: "PASTE_HERE",
    appId: "PASTE_HERE"
  });
  firebase.messaging();
} catch (e) {}
const PDF_LIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const APP_SHELL = ["./", "./index.html", "./manifest.json"];
self.addEventListener("notificationclick", event => {
event.notification.close();
event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
for (const c of list) { if ("focus" in c) return c.focus(); }
return clients.openWindow("./");
}));
});
self.addEventListener("install", event => {
event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all([...APP_SHELL.map(u => cache.add(u).catch(() => {})), fetch(PDF_LIB, { mode: "no-cors" }).then(r => cache.put(PDF_LIB, r)).catch(() => {})])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
const request = event.request;
if (request.method !== "GET") return;
const url = new URL(request.url);
if (request.url === PDF_LIB) {
event.respondWith(caches.match(PDF_LIB).then(hit => hit || fetch(request).then(r => { const c = r.clone(); caches.open(CACHE_NAME).then(ch => ch.put(PDF_LIB, c)).catch(() => {}); return r; })));
return;
}
if (url.origin !== self.location.origin) return;
event.respondWith(fetch(request, { cache: "no-store" }).then(response => {
if (response && response.ok) {
const copy = response.clone();
caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(() => {});
}
return response;
}).catch(() => caches.match(request).then(cached => cached || caches.match("./index.html"))));
});

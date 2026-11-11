"use strict";

const CACHE_NAME = "ojooola-study-v5";
const APP_PREFIX = "ojooola-study-";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json"
];

/* INSTALL */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ACTIVATE */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names =>
        Promise.all(
          names
            .filter(name =>
              name.startsWith(APP_PREFIX) &&
              name !== CACHE_NAME
            )
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* FETCH */
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* Do not cache external websites or Gemini API requests. */
  if (url.origin !== self.location.origin) return;

  /* HTML navigation: network first, cached app as fallback. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            await cache.match(request) ||
            await cache.match("./index.html") ||
            await cache.match("./")
          );
        })
    );
    return;
  }

  /* Same-origin app files: cache first, update in background. */
  event.respondWith(
    caches.match(request).then(cached => {
      const networkUpdate = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, copy));
          }
          return response;
        });

      event.waitUntil(networkUpdate.catch(() => {}));

      return cached || networkUpdate;
    })
  );
});

/* Allow the page to request an immediate update. */
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

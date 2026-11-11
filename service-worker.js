/* =========================================
   OJOOLA AI - SERVICE WORKER
   Automatic cache updates and cleanup
========================================= */

const CACHE_NAME = "ojoola-ai-v3";
const CACHE_PREFIX = "ojoola-ai-";

/* INSTALL */
self.addEventListener("install", event => {
  self.skipWaiting();
});

/* ACTIVATE */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name =>
              name.startsWith(CACHE_PREFIX) &&
              name !== CACHE_NAME
            )
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

/* FETCH */
self.addEventListener("fetch", event => {

  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Ignore external websites and APIs
  if (url.origin !== self.location.origin) return;

  // NETWORK FIRST FOR HTML PAGES
  if (request.mode === "navigate") {

    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy);
            });
          }

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);

          if (cached) return cached;

          return caches.match("./index.html");
        })
    );

    return;
  }

  // CACHE STATIC FILES ONLY
  const isStaticFile =
    /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2|json)$/i
      .test(url.pathname);

  if (!isStaticFile) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {

      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then(response => {

          if (response.ok) {
            cache.put(request, response.clone());
          }

          return response;
        });

      // Return cached file immediately while checking for updates
      if (cached) {
        event.waitUntil(
          networkFetch.catch(() => {})
        );

        return cached;
      }

      // If no cached file exists, use the network
      return networkFetch;
    })
  );

});

/* RECEIVE UPDATE MESSAGE */
self.addEventListener("message", event => {

  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }

});

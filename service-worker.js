const CACHE_NAME = "ojooola-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if(request.method !== "GET") return;

  const url = new URL(request.url);

  /* Never cache Gemini API requests. */
  if(
    url.hostname.includes(
      "generativelanguage.googleapis.com"
    )
  ){
    return;
  }

  /*
    App shell:
    Always try the network first so a new GitHub deployment
    is picked up immediately. If the network fails, use the
    cached version.
  */
  if(
    request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/service-worker.js")
  ){
    event.respondWith(
      fetch(request)
        .then(response => {

          if(
            response &&
            response.ok
          ){
            const copy=
              response.clone();

            caches.open(CACHE_NAME)
              .then(cache =>
                cache.put(
                  request,
                  copy
                )
              )
              .catch(()=>{});
          }

          return response;

        })
        .catch(() =>
          caches.match(request)
            .then(cached =>
              cached ||
              caches.match("./index.html")
            )
        )
    );

    return;
  }

  /*
    Other same-origin GET requests:
    cache first, then network.
  */
  if(url.origin === self.location.origin){

    event.respondWith(
      caches.match(request)
        .then(cached => {

          if(cached){
            return cached;
          }

          return fetch(request)
            .then(response => {

              if(
                response &&
                response.ok
              ){
                const copy=
                  response.clone();

                caches.open(CACHE_NAME)
                  .then(cache =>
                    cache.put(
                      request,
                      copy
                    )
                  )
                  .catch(()=>{});
              }

              return response;
            })
            .catch(() =>
              caches.match("./index.html")
            );
        })
    );
  }
});

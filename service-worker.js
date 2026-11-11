"use strict";

const CACHE_NAME = "ojooola-study-v6";
const CACHE_PREFIX = "ojooola-study-";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json"
];

/* INSTALL */
self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_FILES))
      .then(()=>self.skipWaiting())
  );
});

/* ACTIVATE */
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(names=>
        Promise.all(
          names
            .filter(name=>
              name.startsWith(CACHE_PREFIX)&&
              name!==CACHE_NAME
            )
            .map(name=>caches.delete(name))
        )
      )
      .then(()=>self.clients.claim())
  );
});

/* FETCH */
self.addEventListener("fetch",event=>{
  const request=event.request;

  if(request.method!=="GET")return;

  const url=new URL(request.url);

  /* Never cache external requests or Gemini API calls. */
  if(url.origin!==self.location.origin)return;

  /* Navigation: network first, cache fallback. */
  if(request.mode==="navigate"){
    const networkPromise=fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();

        event.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache=>cache.put("./index.html",copy))
        );
      }

      return response;
    });

    event.respondWith(
      networkPromise.catch(async()=>{
        const cache=await caches.open(CACHE_NAME);

        return (
          await cache.match(request)||
          await cache.match("./index.html")||
          await cache.match("./")
        );
      })
    );

    return;
  }

  /* Static same-origin files: cache first, network fallback/update. */
  const networkPromise=fetch(request).then(response=>{
    if(response.ok){
      const copy=response.clone();

      event.waitUntil(
        caches.open(CACHE_NAME)
          .then(cache=>cache.put(request,copy))
      );
    }

    return response;
  });

  event.respondWith(
    caches.match(request).then(cached=>{
      return cached||networkPromise;
    }).catch(()=>networkPromise)
  );
});

/* Allow the page to request immediate activation. */
self.addEventListener("message",event=>{
  if(event.data==="SKIP_WAITING"){
    self.skipWaiting();
  }
});

// Simple offline cache (PWA)
const CACHE = "tafsir-reader-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/tafsir-nami.pdf",
  "./assets/icons/menu.svg",
  "./assets/icons/search.svg",
  "./assets/icons/moon.svg",
  "./assets/icons/sliders.svg",
  "./assets/icons/x.svg",
  "./assets/icons/chev-left.svg",
  "./assets/icons/chev-right.svg",
  "./assets/icons/fit.svg",
  "./assets/icons/minus.svg",
  "./assets/icons/plus.svg",
  "./assets/icons/share.svg",
  "./assets/icons/download.svg",
  "./assets/icons/bookmark.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : Promise.resolve()));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith((async ()=>{
    const cached = await caches.match(req, { ignoreSearch: true });
    if(cached) return cached;
    try{
      const fresh = await fetch(req);
      // Cache same-origin GETs
      if(req.method === "GET" && new URL(req.url).origin === location.origin){
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    }catch(err){
      return cached || Response.error();
    }
  })());
});

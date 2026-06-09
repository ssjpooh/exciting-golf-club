const CACHE_NAME = "bowling-club-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Simple pass-through for now
  event.respondWith(fetch(event.request));
});

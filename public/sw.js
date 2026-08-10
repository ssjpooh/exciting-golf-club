const CACHE_NAME = "exciting-golf-club-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 예전 버전 캐시 정리
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/**
 * 네트워크 우선 + 오프라인일 때만 캐시 사용.
 * 골프장은 전파가 약한 곳이 많아, 라운드 중 새로고침되면 앱 자체가 안 뜨는 일이 있었다.
 * (온라인일 때는 항상 네트워크 응답을 쓰므로 배포한 새 버전이 캐시에 막히지 않는다.)
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 같은 출처의 문서/정적 파일만 대상 (파이어베이스·카카오·구글 API 등은 그대로 통과)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(req);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // 페이지 이동인데 캐시도 없으면 마지막으로 저장된 앱 화면이라도 보여준다
        if (req.mode === "navigate") {
          const fallback = await caches.match("/");
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});

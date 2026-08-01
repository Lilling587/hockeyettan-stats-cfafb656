// Lightweight service worker for the published app.
//   - NetworkFirst for HTML navigations (so a fresh deploy is picked up)
//   - CacheFirst for same-origin hashed assets (/_build/, /assets/, .js, .css, fonts)
//   - StaleWhileRevalidate for team-logos & manifest
//   - Never caches /_serverFn/*, POST/PUT/DELETE, or /~oauth.
// Cache names are versioned so a new deploy can evict the previous one.

const VERSION = "v1";
const HTML_CACHE = `producer-html-${VERSION}`;
const ASSET_CACHE = `producer-assets-${VERSION}`;
const RUNTIME_CACHE = `producer-runtime-${VERSION}`;
const ALL_CACHES = [HTML_CACHE, ASSET_CACHE, RUNTIME_CACHE];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("producer-") && !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const isHtmlNav = (req) =>
  req.mode === "navigate" ||
  (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));

const isHashedAsset = (url) =>
  /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Skip cross-origin, server functions, OAuth callbacks and auth routes.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_serverFn")) return;
  if (url.pathname.startsWith("/~oauth") || url.pathname.startsWith("/auth")) return;

  // Cache safe public broadcast endpoints so the producer UI keeps working
  // during brief connectivity drops. These endpoints are read-only and idempotent.
  const cacheablePublicApi =
    url.pathname.startsWith("/api/public/vmix/") ||
    url.pathname === "/api/public/vmix/current";
  if (cacheablePublicApi) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (isHtmlNav(req)) {
    event.respondWith(networkFirst(req, HTML_CACHE));
    return;
  }
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await cache.match("/");
    return fallback ?? Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? fetchPromise;
}

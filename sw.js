// Keeps the POS working with no internet after the first visit.
const CACHE = "longleys-pos-mobile-v5";
const FILES = ["./", "index.html", "styles.css", "mobile.css", "mobile-shim.js", "mobile.js", "mobile-vault.js", "mobile-fixes.js", "app.js",
  "accounting.js", "inventory-seed.js", "customers-seed.js", "manifest.webmanifest", "icon.png", "icon-192.png",
  "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  // Add files one by one: a single failed file must not stop the app from installing.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Network first (so updates arrive), cache as the offline fallback.
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r && r.ok && new URL(e.request.url).origin === location.origin) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === "navigate" ? caches.match("./").then((h) => h || caches.match("index.html")) : Response.error())))
  );
});

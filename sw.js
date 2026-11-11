// Offline support: keeps the app shell available without internet.
// Enquiry data is never cached here (it lives in the browser storage / Google Sheet).
const CACHE = "enquiry-tracker-v3";
const SHELL = ["./", "index.html", "app.js", "enquiry.html", "manifest.json", "icon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.includes("script.google")) return;          // never cache sync traffic
  if (url.pathname.endsWith("seed-data.js")) return;
  // network first, fall back to cache (so updates on GitHub appear immediately when online)
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && (url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com")) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

const CACHE_NAME = "kalimat-shell-v2";

const SHELL_FILES = [
  "./index.htm",
  "./manifest.json",
  "./favicon.svg"
];

const STATIC_HOSTS = new Set([
  "www.gstatic.com",
  "cdnjs.cloudflare.com"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("kalimat-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const isSameOrigin = url.origin === self.location.origin;
  const isStaticExternal = STATIC_HOSTS.has(url.hostname);

  if (!isSameOrigin && !isStaticExternal) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }

          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.htm");
          }

          return new Response("", {
            status: 503,
            statusText: "Offline"
          });
        });
    })
  );
});

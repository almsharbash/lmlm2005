/* =========================================================
   Service Worker - كلمات
   ========================================================= */

const VERSION = "kalimat-v11";
const BASE = "/lmlm2005/";

const SHELL = [
  BASE,
  BASE + "index.htm",
  BASE + "manifest.json",
  BASE + "favicon.svg",
  BASE + "kalimat_180x180.png",
  BASE + "kalimat_192x192-1.png",
  BASE + "kalimat_256x256-1.png",
  BASE + "kalimat_512x512-1.png"
];

const CDN_HOSTS = [
  "www.gstatic.com",
  "cdnjs.cloudflare.com"
];

/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);

      await Promise.allSettled(
        SHELL.map(url =>
          cache.add(
            new Request(url, {
              cache: "reload"
            })
          )
        )
      );

      await self.skipWaiting();
    })()
  );
});

/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(key => key !== VERSION)
          .map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const sameOrigin =
    url.origin === self.location.origin;

  const firebaseOrFontAwesome =
    CDN_HOSTS.includes(url.hostname) &&
    (
      url.pathname.startsWith("/firebasejs/") ||
      url.pathname.startsWith("/ajax/libs/font-awesome/")
    );

  /*
    لا نتدخل في طلبات Firebase الخاصة بالمصادقة
    وFirestore وغيرها.
  */
  if (!sameOrigin && !firebaseOrFontAwesome) {
    return;
  }

  /*
    عند فتح التطبيق أو التنقل بين الصفحات:
    استخدم النسخة المخزنة أولًا، ثم حدّثها من الشبكة.
  */
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  /*
    مكتبات Firebase وFont Awesome:
    Cache First
  */
  if (firebaseOrFontAwesome) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /*
    الملفات المحلية:
    Stale While Revalidate
  */
  event.respondWith(staleWhileRevalidate(request));
});

/* =========================================================
   NAVIGATION
   ========================================================= */

async function handleNavigation(request) {
  const cache = await caches.open(VERSION);

  const cached =
    await cache.match(BASE + "index.htm") ||
    await cache.match(BASE);

  try {
    const response = await fetch(request);

   if (response && response.ok && new URL(request.url).pathname.replace(/index\.htm$/, "") === BASE) { {
      await cache.put(BASE + "index.htm", response.clone());
    }

    return response;
  } catch (error) {
    if (cached) {
      return cached;
    }

    return new Response(
      "لا يوجد اتصال بالإنترنت.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      }
    );
  }
}

/* =========================================================
   STALE WHILE REVALIDATE
   ========================================================= */

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(response => {
      if (
        response &&
        (response.ok || response.type === "opaque")
      ) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  return (
    await network ||
    Response.error()
  );
}

/* =========================================================
   CACHE FIRST
   ========================================================= */

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (
      response &&
      (response.ok || response.type === "opaque")
    ) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return Response.error();
  }
}

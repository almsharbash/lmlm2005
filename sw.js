/* عامل الخدمة لمنصة كلمات: يخزّن الواجهة ومكتبات Firebase وFont Awesome للعمل دون اتصال.
   عند نشر نسخة جديدة من index.html غيّر رقم VERSION ليُحدَّث التخزين عند المستخدمين. */
const VERSION = "kalimat-v3";
const SHELL = ["./", "./index.html", "./manifest.json", "./favicon.ico", "./icon-192.png"];
const CDN_HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* لا يفشل التثبيت إذا غاب ملف (مثل أيقونة غير موجودة) */
    await Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const cdn = CDN_HOSTS.includes(url.hostname) &&
    (url.pathname.startsWith("/firebasejs/") || url.pathname.startsWith("/ajax/libs/font-awesome/"));
  /* لا نتدخل في طلبات Firestore وAuth وغيرها؛ مكتبة Firebase تدير بياناتها بنفسها */
  if (!sameOrigin && !cdn) return;
  if (req.mode === "navigate") { e.respondWith(navigate(req, e)); return; }
  e.respondWith(cdn ? cacheFirst(req) : staleWhileRevalidate(req, e));
});

/* فتح فوري من التخزين، وتحديث الصفحة في الخلفية للزيارة التالية */
async function navigate(req, e) {
  const cache = await caches.open(VERSION);
  const cached = (await cache.match("./index.html")) || (await cache.match("./"));
  const net = fetch(req).then(r => { if (r && r.ok) cache.put("./index.html", r.clone()); return r; }).catch(() => null);
  if (cached) { e.waitUntil(net); return cached; }
  return (await net) || new Response("لا يوجد اتصال بالإنترنت", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); return r; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

/* ملفات المكتبات بإصدارات ثابتة، فالأولوية للتخزين */
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone());
    return r;
  } catch {
    return Response.error();
  }
}

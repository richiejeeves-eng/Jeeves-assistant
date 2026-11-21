const CACHE_NAME = "jeeves-shell-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./config.js",
  "./style.css",
  "./executive.css",
  "./council.css",
  "./voice-controls.css",
  "./app.js",
  "./auth.js",
  "./login.js",
  "./lists.js",
  "./voice.js",
  "./jeeves.js",
  "./speak.js",
  "./photo.js",
  "./integrations.js",
  "./executive.js",
  "./fitness.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("jeeves-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(?:rest|auth|functions|storage)\/v1\//.test(url.pathname)) return;

  event.respondWith((async function () {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      throw error;
    }
  })());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : self.location.origin + self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async function (clients) {
    for (const client of clients) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  }));
});

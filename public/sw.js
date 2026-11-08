/**
 * GhostChat Service Worker (PWA Shell)
 *
 * CRITICAL SECURITY ARCHITECTURE (Zero-Plaintext Policy):
 * - Precaches and caches ONLY static application assets (HTML shell, CSS, JS chunks, icons).
 * - STRICTLY BYPASSES and NEVER caches:
 *   1. Firebase Realtime Database connections (*.firebaseio.com)
 *   2. Firebase Auth / Google APIs (*.googleapis.com)
 *   3. Application API routes (/api/*)
 *   4. WebSocket, SSE, or streaming connections
 *   5. Encrypted message transport envelopes or user plaintexts
 * - All message processing remains volatile in-memory only.
 */

const CACHE_NAME = "ghostchat-shell-v1";

const STATIC_PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// 1. Install Event: Precache static app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Precache errors must not block installation
        console.warn("[SW] Precache warning:", err);
      })
  );
});

// 2. Activate Event: Clean up outdated cache generations
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName.startsWith("ghostchat-shell-")) {
              return caches.delete(cacheName);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Strict static filtering & offline shell fallback
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Rule 1: Non-GET requests are strictly bypassed (NEVER cached)
  if (req.method !== "GET") {
    return;
  }

  const url = new URL(req.url);

  // Rule 2: Dynamic backend, Firebase RTDB, and Auth requests are strictly bypassed
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebasedatabase.app") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("securetoken") ||
    url.pathname.startsWith("/api/")
  ) {
    return; // Pass through to network directly without caching
  }

  // Rule 3: Static build assets (Next.js chunks, styles, icons, fonts)
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname === "/manifest.json";

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(req, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // If asset fetch fails and not in cache, let caller handle
            return new Response("", { status: 404, statusText: "Offline" });
          });
      })
    );
    return;
  }

  // Rule 4: Navigation requests (App Shell) - Network-first with cached shell fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match("/").then((shell) => {
          if (shell) return shell;
          return new Response(
            "<!DOCTYPE html><html><head><title>GhostChat Offline</title></head><body><h1>GhostChat is offline</h1><p>Reconnect to access realtime ephemeral messaging.</p></body></html>",
            { headers: { "Content-Type": "text/html" } }
          );
        });
      })
    );
    return;
  }
});

// 4. Notification Click Event: Focus existing window or open shell
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      })
  );
});

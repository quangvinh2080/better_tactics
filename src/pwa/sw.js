// Service worker for the kid-mode chess trainer.
//
// The app shell and versioned assets are cached so the installed app
// opens fast. Puzzle data always goes to the network: the puzzle API
// must never serve stale SRS state from the cache.
const CACHE_NAME = "better-tactics-kid-v1";

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name)),
            ),
        ).then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET") {
        return;
    }
    // Puzzle and user data: network only, never cached.
    if (url.pathname.startsWith("/api/")) {
        return;
    }
    // Versioned static assets: cache first, fill the cache on a miss.
    if (url.pathname.startsWith("/assets_")) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) =>
                cache.match(event.request).then((cached) => {
                    if (cached) {
                        return cached;
                    }
                    return fetch(event.request).then((response) => {
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    });
                }),
            ),
        );
        return;
    }
    // Pages and everything else: network first, cached copy only when offline.
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    if (response.ok) {
                        cache.put(event.request, copy);
                    }
                });
                return response;
            })
            .catch(() =>
                caches
                    .match(event.request)
                    .then((cached) => cached || caches.match("/")),
            ),
    );
});

importScripts('version.js');
const CACHE_NAME = 'subsoccer-pro-' + APP_VERSION;
const ASSETS = [
    '/',
    '/index.html',
    '/version.js',
    '/style.css',
    '/the-forge.css',
    '/config.js',
    '/auth.js',
    '/ui.js',
    '/script.js',
    '/audio-engine.js',
    // Offline-pelitila: pelisivut ja -logiikka
    '/mobile-game.html',
    '/mobile-game-logic.js',
    '/quick-match.js',
    '/match-service.js',
    '/bracket-engine.js',
    '/game-service.js',
    '/offline-queue.js',
    '/qr-lobby.js',
    // Resurssit
    '/subsoccer_logo.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/subsoccer-teams-ny2.jpg'
];

// Asennusvaihe: Tallennetaan tärkeimmät tiedostot välimuistiin
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching offline assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Aktivointivaihe: Siivotaan vanhat välimuistit
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Hakuvaihe (Fetch): Palautetaan välimuistista jos offline, muuten verkosta
self.addEventListener('fetch', (event) => {
    // Ei välimuistia ulkoisiin domaineihin
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Admin-sivut menevät AINA suoraan networkiin (ei SW-cacheä auth-sivuille)
    const NETWORK_ONLY_PATHS = [
        '/moderator',
        '/analytics-dashboard',
        '/owner-dashboard',
        '/control-room',
        '/brand-builder',
        '/theme-editor',
        '/qr-batch-exporter',
        '/registered-players',
    ];
    const url = new URL(event.request.url);
    if (NETWORK_ONLY_PATHS.some(p => url.pathname.startsWith(p))) {
        return; // Ei intercept — menee suoraan selaimelle
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Jos löytyy välimuistista, palauta se

            if (cachedResponse) {
                // Haetaan taustalla uusin versio verkosta (Stale-while-revalidate pattern)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse.status !== 206 && networkResponse.ok) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone()).catch(err => {
                                console.warn('[Service Worker] Cache put failed in bg:', err.message);
                            });
                        }).catch(() => {});
                    }
                }).catch(() => { /* Vain ohitetaan, ollaan offline */ });
                
                return cachedResponse;
            }

            // Muuten haetaan verkosta
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse.status !== 206 && networkResponse.ok) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone()).catch(err => {
                            console.warn('[Service Worker] Cache put failed:', err.message);
                        });
                    }).catch(() => {});
                }
                return networkResponse;
            }).catch((err) => {
                console.error('[Service Worker] Fetch failed:', err);
                // Palautetaan offline-vastaus, jotta käyttäjä ei näe tyhjää sivua
                return new Response(
                    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Subsoccer Offline</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px}.c{max-width:400px}h1{font-size:2rem;margin-bottom:15px;color:#c41e2a}p{color:#888;margin-bottom:20px;line-height:1.5}button{background:#c41e2a;color:#fff;border:none;padding:14px 30px;border-radius:4px;font-size:1rem;cursor:pointer;font-weight:bold;letter-spacing:1px}</style></head><body><div class="c"><h1>📡 OFFLINE</h1><p>Connection lost. Check your WiFi and try again.</p><button onclick="location.reload()">RETRY</button></div></body></html>',
                    { headers: { 'Content-Type': 'text/html' }, status: 503 }
                );
            });
        })
    );
});

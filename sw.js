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
    '/subsoccer_logo.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/subsoccer-teams.jpg'
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
    // Ei välimuistia Supabasen API-kutsuihin tai ulkoisiin domaineihin tässä yksinkertaisessa toteutuksessa
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
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
            });
        })
    );
});

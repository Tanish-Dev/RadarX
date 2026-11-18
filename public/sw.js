// RadarX has no service worker. A stale one registered on this origin by another local app makes the
// browser request /sw.js on every load (404 spam in the dev log); this one unregisters itself.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.registration.unregister());

/* Home Bookings app: fast start + reliable booking alerts.
   Alerts are handled by a plain Web Push handler (no Firebase script is loaded here), so they cannot fail
   because a script did not download, and they show even while the app is open on the screen. */
var V = 'hb-v5', SHELL = ['staff.html', 'staff.css?v=10', 'staff.js?v=12', 'firebase-config.js?v=2', 'images/favicon-192.png', 'images/badge-96.png'];

self.addEventListener('push', function (e) {
  var d = {};
  try { var p = e.data ? e.data.json() : {}; d = p.data || p.notification || p; }
  catch (x) { try { d = { body: e.data.text() }; } catch (y) {} }
  e.waitUntil(self.registration.showNotification(d.title || 'New booking', {
    body: d.body || '', icon: 'images/icon-512.png', badge: 'images/badge-96.png',
    tag: d.id || ('bk' + Date.now()), renotify: true, vibrate: [200, 100, 200]
  }));
});

self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });

self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;      // never touch the server calls
  var page = r.mode === 'navigate' || /staff\.html$/.test(new URL(r.url).pathname);
  if (page) {   // the page itself: network first (always the newest), cache when offline
    e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; }).catch(function () { return caches.match(r); }));
    return;
  }
  // scripts, styles, images: open instantly from the phone, refresh quietly in the background
  e.respondWith(caches.match(r).then(function (hit) {
    var net = fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; }).catch(function () { return hit; });
    return hit || net;
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if ('focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow('staff.html');
  }));
});

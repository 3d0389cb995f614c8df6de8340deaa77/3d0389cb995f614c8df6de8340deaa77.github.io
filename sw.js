/* Home Bookings app: keeps the app shell available and shows booking alerts */
try { importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js', 'firebase-config.js'); } catch (e) {}   // if Firebase cannot load, the app still works without push
/* Firebase push: the server sends data-only messages, so this is the one place that shows the alert */
try {
  firebase.initializeApp(self.FB_CONFIG);
  firebase.messaging().onBackgroundMessage(function (m) {
    var d = m.data || {};
    return self.registration.showNotification(d.title || 'New booking', { body: d.body || '', icon: 'images/favicon-192.png', badge: 'images/favicon-96.png', tag: 'new-booking', renotify: true, vibrate: [120, 60, 120] });
  });
} catch (e) {}
var V = 'hb-v3', SHELL = ['staff.html', 'staff.css?v=9', 'staff.js?v=9', 'images/favicon-192.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;      // never touch the booking server calls
  e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; }).catch(function () { return caches.match(r); }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if ('focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow('staff.html');
  }));
});

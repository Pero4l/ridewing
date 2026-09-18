'use strict';

/* RideWing service worker — registers the `push` and `notificationclick`
 * listeners that turn VAPID-signed Web Push payloads into visible toasts.
 * The file is small and dependency-free on purpose, so it can be served
 * straight from /sw.js with no build step or cache busting. */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* The backend delivers the full serialized notification as the push payload,
 * so the client never has to round-trip to re-fetch what it already knows. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'RideWing', body: 'You have a new notification' };
  }
  const { title, body, type, entityId, notificationId } = data.siteNotifications
    ? data.siteNotifications[0]
    : data;

  const options = {
    body: body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { type, entityId, notificationId },
  };

  event.waitUntil(self.registration.showNotification(title || 'RideWing', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { type, entityId } = event.notification.data || {};

  let url = '/app';
  if (type && entityId) {
    if (type === 'message') url = `/app/messages`;
    else if (type === 'ride_invite') url = `/app/rides`;
    else if (type === 'like') url = `/app/posts/${entityId}`;
    else url = `/app`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus().then((c) => c.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});

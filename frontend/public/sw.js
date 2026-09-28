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
    data = {};
  }

  // The sender wraps one notification in `siteNotifications`. A bare payload is
  // accepted too, so a hand-crafted test push still renders something.
  const first = Array.isArray(data.siteNotifications) ? data.siteNotifications[0] : data;
  const { title, body, type, entityId, notificationId, data: extra, tag, renotify } = first || {};

  const options = {
    body: body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // An Android action row is the fastest route back into the right screen.
    actions: [{ action: 'open', title: 'Open' }],
    // `tag` collapses repeat notifications for the same thing — a rider who has
    // not looked at the app should see the latest "needs help" for a ride, not
    // a stack of them. `renotify` still alerts on the replacement.
    tag: tag || undefined,
    renotify: Boolean(renotify),
    data: { type, entityId, notificationId, extra: extra || {} },
  };

  event.waitUntil(self.registration.showNotification(title || 'RideWing', options));
});

/**
 * Maps a notification onto the screen it belongs to.
 *
 * The `type` values here must match what the backend actually emits
 * (`notification.service.js`) — an unmatched type used to fall through to a
 * dead `/app/posts/:id` link, so every branch is explicit and the notification
 * centre is the safe default.
 */
function routeFor({ type, entityId, extra }) {
  const detail = extra || {};

  switch (type) {
    case 'message':
      return detail.conversationId
        ? `/app/messages/${detail.conversationId}`
        : '/app/messages';
    case 'ride_invite':
      return entityId ? `/app/rides/${entityId}` : '/app/rides';
    case 'ride_signal':
      return entityId ? `/app/rides/${entityId}` : '/app/rides';
    case 'post_like':
    case 'post_comment':
    case 'post_share':
    case 'comment_reply':
      return entityId ? `/app/posts/${entityId}` : '/app/notifications';
    case 'follow':
      return detail.username ? `/app/profile/${detail.username}` : '/app/notifications';
    case 'community_join_request':
    case 'community_join_approved':
    case 'community_join_rejected':
    case 'community_role_changed':
      return detail.communitySlug ? `/app/communities/${detail.communitySlug}` : '/app/notifications';
    case 'support_ticket':
      return '/app/support';
    default:
      return '/app/notifications';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = routeFor(event.notification.data || {});

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse a tab that is already open on this origin instead of piling up
      // duplicates, and let the app decide how to route inside itself.
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        return existing.focus().then((focused) => {
          focused.postMessage({ type: 'ridewing:navigate', url });
          return focused;
        });
      }
      return self.clients.openWindow(url);
    }),
  );
});

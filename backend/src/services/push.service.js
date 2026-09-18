'use strict';

/**
 * Web Push (RFC 8030) — VAPID-signed subscription storage + delivery.
 *
 * `web-push` is loaded lazily and only when VAPID keys are configured, so a
 * backend without VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY keeps booting, testing
 * and serving everything else. Nothing in this module is required eagerly.
 */

const { PushSubscription } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Loaded lazily in requireWebPush() — not an eager dependency.
let webPush;

function enabled() {
  return env.push.enabled;
}

function requireWebPush() {
  if (!enabled()) {
    throw ApiError.notFound('Push messaging is not configured');
  }
  if (!webPush) {
    // Deliberately not in package.json: the backend must boot without it.
    // Installed via `npm i web-push` on the host that sends pushes.
    // eslint-disable-next-line global-require
    webPush = require('web-push');
    webPush.setVapidDetails(
      env.push.subject,
      env.push.publicKey,
      env.push.privateKey,
    );
  }
  return webPush;
}

/** Persist a new (or refreshed) subscription for a user on a device. */
async function subscribe(userId, { endpoint, p256dh, auth, deviceId, userAgent }) {
  if (!enabled()) throw ApiError.notFound('Push messaging is not configured');

  const [subscription] = await PushSubscription.findOrCreate({
    where: { userId, deviceId },
    defaults: { userId, deviceId, endpoint, p256dh, auth, userAgent },
  });

  if (subscription.endpoint !== endpoint) {
    await subscription.update({ endpoint, p256dh, auth, userAgent });
  }
  return subscription;
}

/** Remove a device's subscription (sign-out, revoked permission, 410 Gone). */
async function unsubscribe(userId, { deviceId } = {}) {
  if (!enabled()) return null | undefined;
  const where = { userId };
  if (deviceId) where.deviceId = deviceId;
  return PushSubscription.destroy({ where });
}

/** Re-arms a device that reported `410 Gone` and lost its subscription. */
async function deleteSubscription(userId, deviceId) {
  return unsubscribe(userId, { deviceId });
}

/**
 * Send `payload` to every subscription for a user. Each VAPID delivery is
 * isolated so one expired device can never block the rest.
 */
async function sendToUser(userId, payload) {
  const wp = requireWebPush();
  const subscriptions = await PushSubscription.findAll({ where: { userId } });
  if (!subscriptions.length) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      wp.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
      ),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  for (const failure of failed) {
    if (failure.reason && failure.reason.statusCode === 410 && failure.reason.endpoint) {
      await PushSubscription.destroy({ where: { endpoint: failure.reason.endpoint } })
        .catch(() => {});
    }
  }

  return { sent: results.length - failed.length, failed: failed.length };
}

module.exports = { enabled, subscribe, unsubscribe, deleteSubscription, sendToUser };

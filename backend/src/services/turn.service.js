'use strict';

/**
 * WebRTC TURN credential minting.
 *
 * Two modes:
 *   1. Static long-lived credentials — TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL.
 *   2. Cloudflare Realtime TURN — short-lived credentials minted server-side so
 *      the long-lived API token never leaves this server. The endpoint caches the
 *      minted credential until it's close to expiry and falls back to static on
 *      failure.
 */

const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const CF_LIFETIME_SECONDS = 24 * 60 * 60; // 24 hours, well under the 48h max
const REFRESH_MARGIN_SECONDS = 60 * 60; // mint 1h before expiry

let cached = null; // { iceServers, expiresAt }

function cfEnabled() {
  return Boolean(env.cloudflare?.keyId && env.cloudflare?.apiToken);
}

function staticEnabled() {
  const w = env.webrtc;
  return Boolean(w.turnUrls?.length && w.turnUsername && w.turnCredential);
}

function cfCredentialUrl(keyId) {
  return `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`;
}

async function fetchCloudflareIceServers() {
  const res = await fetch(cfCredentialUrl(env.cloudflare.keyId), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.cloudflare.apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ttl: CF_LIFETIME_SECONDS }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body: body.slice(0, 200) }, 'Cloudflare TURN credential mint failed');
    throw new Error(`Cloudflare API returned ${res.status}`);
  }

  const data = await res.json();
  const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
  if (!iceServers.length) throw new Error('Cloudflare returned empty iceServers');
  return iceServers;
}

function buildStaticIceServers() {
  return [
    ...env.webrtc.iceServers,
    ...(staticEnabled()
      ? [{ urls: env.webrtc.turnUrls, username: env.webrtc.turnUsername, credential: env.webrtc.turnCredential }]
      : []),
  ];
}

/**
 * Returns the full ICE config for the current client. In production this should
 * be called from an authenticated route so TURN credentials are not public.
 */
async function getIceServers() {
  if (cfEnabled()) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!cached || nowSeconds + REFRESH_MARGIN_SECONDS >= cached.expiresAt) {
      try {
        const iceServers = await fetchCloudflareIceServers();
        cached = { iceServers, expiresAt: nowSeconds + CF_LIFETIME_SECONDS };
      } catch (error) {
        logger.warn({ err: error.message }, 'Falling back to static ICE servers after Cloudflare failure');
        cached = null;
      }
    }
    if (cached) return cached.iceServers;
  }

  return buildStaticIceServers();
}

module.exports = { getIceServers };
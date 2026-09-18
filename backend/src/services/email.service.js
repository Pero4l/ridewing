'use strict';

/**
 * Transactional email via the Brevo HTTP API.
 *
 * Uses Node's global fetch — no SDK dependency. When Brevo is not configured,
 * `enabled` is false and every send fails with serviceUnavailable so callers
 * degrade gracefully instead of pretending mail was delivered.
 */

const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const BREVO_API = 'https://api.brevo.com/v3';

const enabled = () => env.email.enabled;

async function sendTransactional({ to, subject, html, text }) {
  if (!enabled()) {
    throw ApiError.serviceUnavailable('Email is not configured on this server');
  }

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean).map((email) => ({ email }));

  const response = await fetch(`${BREVO_API}/smtp/email`, {
    method: 'POST',
    headers: {
      'api-key': env.email.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.email.senderEmail, name: env.email.senderName },
      to: recipients,
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      logger.error({ status: response.status, body: detail.slice(0, 500) }, 'Brevo rejected request');
      throw ApiError.serviceUnavailable('Email service rejected the request');
    }
    logger.warn({ status: response.status, body: detail.slice(0, 500) }, 'Brevo send failed');
    throw ApiError.serviceUnavailable('Could not deliver email');
  }
}

module.exports = { enabled, sendTransactional };
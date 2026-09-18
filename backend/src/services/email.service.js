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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Branded HTML shell shared by every RideWing email. Text stays plain (email
 * clients that cannot render HTML still receive the link text), while the HTML
 * body presents actions as buttons rather than raw URLs.
 */
function renderHtml({ title, preview, paragraphs = [], button }) {
  const body = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#059669;border-radius:12px 12px 0 0;padding:16px 20px">',
    '<tr><td style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.3px">RideWing</td></tr>',
    '</table>',
    '<div style="border:1px solid #e4e4e7;border-top:0;border-radius:0 0 12px 12px;padding:22px">',
    `<h2 style="margin:0 0 4px;font-size:18px;color:#18181b">${escapeHtml(title)}</h2>`,
    preview ? `<p style="margin:0 0 16px;color:#71717a;font-size:13px">${escapeHtml(preview)}</p>` : '',
    ...paragraphs.map(
      (paragraph) => `<p style="margin:12px 0;line-height:1.55;color:#3f3f46;font-size:14px">${escapeHtml(paragraph)}</p>`,
    ),
    button
      ? `<p style="margin:22px 0;text-align:center"><a href="${button.href}" style="display:inline-block;background:#059669;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>`
      : '',
    '</div>',
    '<p style="font-size:12px;color:#a1a1aa;margin:16px 0;text-align:center">RideWing &middot; Ride with riders you trust</p>',
    '</div>',
  ];
  return body.join('');
}

/**
 * Fire-and-forget admin inboxes. Never throws — unconfigured or failed sends
 * must not interrupt the action that triggered the alert (e.g. a signup).
 */
function alertAdmins({ subject, text = '', html = '' }) {
  const admins = env.admin.emails;
  if (!enabled() || !admins.length) return;
  queueMicrotask(async () => {
    try {
      await sendTransactional({ to: admins, subject, text, html });
    } catch (error) {
      logger.warn({ error: error.message, subject }, 'admin alert email failed');
    }
  });
}

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

module.exports = { enabled, sendTransactional, renderHtml, alertAdmins };
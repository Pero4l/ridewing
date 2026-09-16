'use strict';

/**
 * Environment loading and validation.
 *
 * Every secret in RideWing comes from the environment — nothing is defaulted to a
 * usable value. The process refuses to boot when a required variable is missing or
 * too weak, so a misconfigured deploy fails loudly instead of running insecurely.
 */

const path = require('path');
const { z } = require('zod');

require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

const csv = (value) =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

// dotenv produces `''` for empty values; treat that as "not configured" rather
// than a value that fails a min-length check.
const optionalString = (min = 1) =>
  z.preprocess((value) => (value === undefined || value === '' ? undefined : value), z.string().min(min).optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    // Database — either a single URL or discrete parts.
    DATABASE_URL: z.string().min(1).optional(),
    DB_HOST: z.string().min(1).default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().min(1).default('ridewing_development'),
    DB_USER: z.string().min(1).default('postgres'),
    DB_PASSWORD: z.string().default(''),
    DB_SSL: booleanish.default('false'),
    DB_LOGGING: booleanish.default('false'),

    // Auth
    JWT_ACCESS_SECRET: z
      .string({ required_error: 'JWT_ACCESS_SECRET is required' })
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    // HTTP
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: booleanish.default('false'),
    COOKIE_SECURE: booleanish.optional(),
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),

    // Limits
    MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().max(10000).default(2000),
    MAX_RIDE_PARTICIPANTS: z.coerce.number().int().positive().max(50).default(8),

    // WebRTC ICE servers. TURN credentials are served to authenticated clients
    // only — they are never baked into the frontend bundle.
    STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),

    // Cloudinary — media uploads. All three are required to enable uploads.
    CLOUDINARY_CLOUD_NAME: optionalString(),
    CLOUDINARY_API_KEY: optionalString(),
    CLOUDINARY_API_SECRET: optionalString(),
    CLOUDINARY_UPLOAD_FOLDER: z.string().default('ridewing'),

    // WebRTC TURN relays. Either static long-lived credentials (self-hosted
    // coturn / Metered) or short-lived Cloudflare Realtime TURN credentials
    // minted server-side (Settings → Realtime → TURN).
    TURN_URLS: z.string().optional(),
    TURN_USERNAME: z.string().optional(),
    TURN_CREDENTIAL: z.string().optional(),
    CLOUDFLARE_TURN_KEY_ID: optionalString(),
    CLOUDFLARE_TURN_API_TOKEN: optionalString(),

    // Brevo transactional email + the public frontend URL used in email links.
    BREVO_API_KEY: optionalString(),
    BREVO_SENDER_EMAIL: optionalString(),
    BREVO_SENDER_NAME: z.string().min(1).default('RideWing'),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce.number().int().positive().max(72).default(24),
    PASSWORD_RESET_TOKEN_TTL_HOURS: z.coerce.number().int().positive().max(72).default(1),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (csv(value.CORS_ORIGINS).some((origin) => origin === '*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'Wildcard CORS origins are not allowed in production',
      });
    }
    if (value.COOKIE_SAMESITE === 'none' && value.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print only variable names and messages — never the offending values.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nRideWing cannot start — invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';

const iceServers = [{ urls: csv(raw.STUN_URLS) }];
if (raw.TURN_URLS && raw.TURN_USERNAME && raw.TURN_CREDENTIAL) {
  iceServers.push({
    urls: csv(raw.TURN_URLS),
    username: raw.TURN_USERNAME,
    credential: raw.TURN_CREDENTIAL,
  });
}

const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  logLevel: raw.LOG_LEVEL,
  trustProxy: raw.TRUST_PROXY,

  db: {
    url: raw.DATABASE_URL || null,
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    name: raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
    ssl: raw.DB_SSL,
    logging: raw.DB_LOGGING,
  },

  auth: {
    accessSecret: raw.JWT_ACCESS_SECRET,
    accessTokenTtl: raw.ACCESS_TOKEN_TTL,
    refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
    bcryptRounds: raw.BCRYPT_ROUNDS,
  },

  cookies: {
    secure: raw.COOKIE_SECURE ?? isProduction,
    sameSite: raw.COOKIE_SAMESITE,
    domain: raw.COOKIE_DOMAIN || undefined,
  },

  corsOrigins: csv(raw.CORS_ORIGINS),

  limits: {
    maxMessageLength: raw.MAX_MESSAGE_LENGTH,
    maxRideParticipants: raw.MAX_RIDE_PARTICIPANTS,
  },

  webrtc: {
    iceServers,
    turnUrls: raw.TURN_URLS ? csv(raw.TURN_URLS) : [],
    turnUsername: raw.TURN_USERNAME,
    turnCredential: raw.TURN_CREDENTIAL,
  },

  cloudflare: {
    keyId: raw.CLOUDFLARE_TURN_KEY_ID,
    apiToken: raw.CLOUDFLARE_TURN_API_TOKEN,
  },

  cloudinary: {
    cloudName: raw.CLOUDINARY_CLOUD_NAME,
    apiKey: raw.CLOUDINARY_API_KEY,
    apiSecret: raw.CLOUDINARY_API_SECRET,
    folder: raw.CLOUDINARY_UPLOAD_FOLDER || 'ridewing',
    enabled: Boolean(raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET),
  },

  email: {
    brevoApiKey: raw.BREVO_API_KEY,
    senderEmail: raw.BREVO_SENDER_EMAIL,
    senderName: raw.BREVO_SENDER_NAME,
    enabled: Boolean(raw.BREVO_API_KEY && raw.BREVO_SENDER_EMAIL),
    verificationTokenTtlHours: raw.EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
    passwordResetTokenTtlHours: raw.PASSWORD_RESET_TOKEN_TTL_HOURS,
  },

  frontendUrl: raw.FRONTEND_URL,
};

module.exports = env;

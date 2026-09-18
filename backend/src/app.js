'use strict';

/**
 * Express application.
 *
 * Security middleware is applied before anything can reach a route: Helmet headers,
 * an origin allow-list for CORS, a body-size cap, and a global rate limit. The app
 * is exported without listening so tests can mount it directly with Supertest.
 */

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
const ApiError = require('./utils/ApiError');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const { globalLimiter } = require('./middleware/rateLimit');

const app = express();

// Behind a load balancer, trust the proxy so `req.ip` is the real client — rate
// limiting depends on it. Off by default: enabling it blindly lets a client spoof
// X-Forwarded-For and evade limits.
if (env.trustProxy) app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(
  helmet({
    // The API serves JSON, never HTML, so a restrictive default CSP is safe.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    // Public JSON API: the frontend runs on a different site (e.g. Vercel vs
    // Render), so cross-site reading must be allowed. CORP same-site here would
    // independently block every response from being read cross-site, regardless
    // of CORS — JSON is not HTML, so there is nothing to protect by forbidding
    // embedding.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  }),
);

/**
 * CORS with an explicit allow-list. Requests with no Origin (server-to-server,
 * health checks) are permitted; a browser Origin that is not listed is rejected
 * with a 403 rather than being silently echoed back.
 */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      // An ApiError keeps this a clean 403 instead of an opaque 500.
      return callback(ApiError.forbidden('Origin not allowed by CORS'));
    },
    credentials: true, // required for the refresh cookie
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

// A request id makes a client-reported error traceable in the logs.
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    // Health checks are noise at info level.
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Log only what is useful — never headers or bodies, which carry credentials.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.use(compression());
app.use(cookieParser());

// Bounded body: message limits are enforced again in validators, but a hard cap
// here stops oversized payloads before they are parsed.
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.use('/api', globalLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

'use strict';

/**
 * Server entry point.
 *
 * Verifies the database is reachable before accepting traffic, attaches Socket.IO to
 * the same HTTP server, and shuts everything down in order on a signal so in-flight
 * requests finish and sockets are closed cleanly.
 */

const http = require('http');

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { sequelize } = require('./models');
const { createSocketServer } = require('./sockets');
const tokenService = require('./services/token.service');
const rideService = require('./services/ride.service');
const { emitToRide } = require('./sockets/emit');

const server = http.createServer(app);
const io = createSocketServer(server);

// Hourly sweep of expired/revoked refresh tokens.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
let purgeTimer = null;

// Ends rides that have been idle for the threshold. Runs more often than the
// threshold so a ride is ended within minutes of going quiet.
const RIDE_IDLE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let rideIdleSweepTimer = null;

async function sweepIdleRides() {
  try {
    const ended = await rideService.expireIdleRides();
    if (!ended.length) return;
    ended.forEach((result) => emitToRide(result.id, 'ride:ended', result));
    logger.info({ count: ended.length }, 'ended idle rides');
  } catch (error) {
    logger.warn({ err: error }, 'idle ride sweep failed');
  }
}

async function start() {
  try {
    await sequelize.authenticate();
    logger.info('database connection established');
  } catch (error) {
    logger.error({ err: error }, 'could not connect to the database — refusing to start');
    process.exit(1);
  }

  server.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv, corsOrigins: env.corsOrigins },
      'RideWing API listening',
    );
  });

  purgeTimer = setInterval(() => {
    tokenService
      .purgeExpired()
      .then((removed) => {
        if (removed) logger.debug({ removed }, 'purged expired refresh tokens');
      })
      .catch((error) => logger.warn({ err: error }, 'refresh token purge failed'));
  }, PURGE_INTERVAL_MS);
  purgeTimer.unref();

  // Sweep once at boot so rides that went idle while we were down are ended,
  // then on the interval for ongoing enforcement.
  sweepIdleRides();
  rideIdleSweepTimer = setInterval(sweepIdleRides, RIDE_IDLE_SWEEP_INTERVAL_MS);
  rideIdleSweepTimer.unref();
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  if (purgeTimer) clearInterval(purgeTimer);
  if (rideIdleSweepTimer) clearInterval(rideIdleSweepTimer);

  // Stop accepting new work, then release resources.
  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out — exiting');
    process.exit(1);
  }, 15000);
  forceExit.unref();

  try {
    // io.close() also closes the HTTP server it is attached to, so the sockets are
    // disconnected and the listener is released in one step.
    await new Promise((resolve) => io.close(() => resolve()));
    await sequelize.close();
    clearTimeout(forceExit);
    logger.info('shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

// A crash with an unknown state is not safe to continue from; log and let the
// process manager restart us.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception — exiting');
  process.exit(1);
});

start();

module.exports = { server, io };

'use strict';

/**
 * Jest global setup.
 *
 * Probes for a reachable Postgres once, before any suite runs, and records the
 * result. Integration suites that need a database skip themselves cleanly when
 * none is configured, so `npm test` is always runnable — it just covers less.
 */

require('./setupEnv');

module.exports = async function globalSetup() {
  process.env.RIDEWING_DB_AVAILABLE = '0';

  try {
    const { sequelize } = require('../src/models');
    await sequelize.authenticate();
    await sequelize.close();
    process.env.RIDEWING_DB_AVAILABLE = '1';
    // eslint-disable-next-line no-console
    console.log('\n[tests] database reachable — running full suite including integration tests');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[tests] no database reachable (${error.message.split('\n')[0]}) — integration tests will be skipped`,
    );
  }
};

'use strict';

/**
 * Runs a side effect after the transaction commits, without letting it become
 * the caller's problem.
 *
 * Sequelize *awaits* `afterCommit` hooks (see `lib/transaction.js`), so a
 * rejected hook propagates out of `commit()` and surfaces to the client as a
 * 500 — for a write that already succeeded. The client then retries, and the
 * retry double-applies. Notifications are a side effect of a committed write,
 * never a precondition for it, so a failure here is logged and dropped.
 */

const logger = require('../config/logger');

function afterCommit(transaction, fn) {
  transaction.afterCommit(() => {
    Promise.resolve()
      .then(fn)
      .catch((error) => {
        logger.error({ err: error }, 'afterCommit side effect failed — write already committed');
      });
  });
}

module.exports = afterCommit;
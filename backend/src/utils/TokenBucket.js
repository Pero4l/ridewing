'use strict';

/**
 * In-memory token bucket, used to rate-limit socket events.
 *
 * Per-process by design: it protects a single node against a flooding client. A
 * multi-node deployment should back this with Redis, which is also what Socket.IO
 * would need for horizontal scaling — noted in the deployment README.
 */
class TokenBucket {
  /**
   * @param {{capacity: number, refillPerSecond: number}} options
   */
  constructor({ capacity, refillPerSecond }) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Returns true when the action is allowed and consumes a token. */
  tryRemove(count = 1) {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;

    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
      this.lastRefill = now;
    }

    if (this.tokens < count) return false;
    this.tokens -= count;
    return true;
  }
}

module.exports = TokenBucket;

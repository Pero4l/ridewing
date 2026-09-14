'use strict';

/**
 * Input validation as a security control.
 *
 * The important property is not "bad input produces a nice message" but that a
 * client cannot smuggle fields it does not own — a `role`, a `passwordHash`, an
 * `id` — into a payload that later reaches a model update.
 */

const authValidator = require('../src/validators/auth.validator');
const userValidator = require('../src/validators/user.validator');
const communityValidator = require('../src/validators/community.validator');
const messageValidator = require('../src/validators/message.validator');
const env = require('../src/config/env');

describe('privilege escalation via extra fields', () => {
  it('rejects a registration that tries to set its own id or password hash', () => {
    const attempt = authValidator.register.safeParse({
      username: 'newrider',
      email: 'new@example.com',
      password: 'a-long-enough-password',
      id: '11111111-1111-4111-8111-111111111111',
      passwordHash: '$2b$12$injected',
    });

    expect(attempt.success).toBe(false);
  });

  it('rejects a profile update carrying a role or membership change', () => {
    const attempt = userValidator.updateProfile.safeParse({
      displayName: 'Rider',
      role: 'owner',
    });

    expect(attempt.success).toBe(false);
  });

  it('does not allow "owner" to be granted through the role endpoint', () => {
    expect(communityValidator.setRole.safeParse({ role: 'owner' }).success).toBe(false);
    expect(communityValidator.setRole.safeParse({ role: 'admin' }).success).toBe(true);
  });

  it('rejects a community create that presets counters or ownership', () => {
    const attempt = communityValidator.create.safeParse({
      name: 'Canyon Carvers',
      ownerId: '11111111-1111-4111-8111-111111111111',
      memberCount: 9999,
    });

    expect(attempt.success).toBe(false);
  });

  it('rejects a message payload that tries to spoof the sender', () => {
    const attempt = messageValidator.sendMessage.safeParse({
      content: 'hello',
      senderId: '11111111-1111-4111-8111-111111111111',
    });

    expect(attempt.success).toBe(false);
  });
});

describe('registration rules', () => {
  it('requires an email or a phone number', () => {
    const neither = authValidator.register.safeParse({
      username: 'rider',
      password: 'a-long-enough-password',
    });
    const withEmail = authValidator.register.safeParse({
      username: 'rider',
      email: 'rider@example.com',
      password: 'a-long-enough-password',
    });
    const withPhone = authValidator.register.safeParse({
      username: 'rider',
      phone: '+14155550123',
      password: 'a-long-enough-password',
    });

    expect(neither.success).toBe(false);
    expect(withEmail.success).toBe(true);
    expect(withPhone.success).toBe(true);
  });

  it('rejects short passwords and passwords beyond bcrypt\'s 72-byte input limit', () => {
    const short = authValidator.register.safeParse({
      username: 'rider',
      email: 'rider@example.com',
      password: 'short',
    });
    // Beyond 72 bytes bcrypt silently ignores the remainder, so we reject instead
    // of letting a user believe a longer passphrase is protecting them.
    const tooLong = authValidator.register.safeParse({
      username: 'rider',
      email: 'rider@example.com',
      password: 'x'.repeat(73),
    });

    expect(short.success).toBe(false);
    expect(tooLong.success).toBe(false);
  });

  it('counts multi-byte characters as bytes against the bcrypt limit', () => {
    // 30 emoji at 4 bytes each = 120 bytes, well past the limit despite being
    // only 30 "characters" by length.
    const result = authValidator.register.safeParse({
      username: 'rider',
      email: 'rider@example.com',
      password: '🏍'.repeat(30),
    });

    expect(result.success).toBe(false);
  });

  it('normalizes usernames and emails to lower case', () => {
    const parsed = authValidator.register.parse({
      username: 'RiderOne',
      email: 'Rider@Example.COM',
      password: 'a-long-enough-password',
    });

    expect(parsed.username).toBe('riderone');
    expect(parsed.email).toBe('rider@example.com');
  });

  it('rejects usernames that could be confused with routes or contain separators', () => {
    ['ab', 'has space', 'has/slash', 'has.dot', 'a'.repeat(31), 'CAPS!'].forEach((username) => {
      const result = authValidator.register.safeParse({
        username,
        email: 'rider@example.com',
        password: 'a-long-enough-password',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('message limits', () => {
  it('enforces the configured maximum length', () => {
    const atLimit = messageValidator.sendMessage.safeParse({
      content: 'x'.repeat(env.limits.maxMessageLength),
    });
    const overLimit = messageValidator.sendMessage.safeParse({
      content: 'x'.repeat(env.limits.maxMessageLength + 1),
    });

    expect(atLimit.success).toBe(true);
    expect(overLimit.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    expect(messageValidator.sendMessage.safeParse({ content: '   \n\t ' }).success).toBe(false);
  });
});

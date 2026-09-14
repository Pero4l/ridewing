'use strict';

/**
 * Token security.
 *
 * These are the checks that must never regress: a token signed by someone else, or
 * altered after signing, or issued for a different audience, must be rejected.
 */

const jwt = require('jsonwebtoken');
const tokenService = require('../src/services/token.service');
const env = require('../src/config/env');

const user = { id: '11111111-1111-4111-8111-111111111111', username: 'rider' };

describe('access tokens', () => {
  it('round-trips a valid token and carries the subject', () => {
    const token = tokenService.signAccessToken(user);
    const payload = tokenService.verifyAccessToken(token);

    expect(payload.sub).toBe(user.id);
    expect(payload.username).toBe('rider');
  });

  it('never embeds the password hash or other secrets in the payload', () => {
    const token = tokenService.signAccessToken({ ...user, passwordHash: '$2b$12$sensitive' });
    const decoded = jwt.decode(token);

    expect(decoded).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(decoded)).not.toContain('sensitive');
    // Only the fields we deliberately include.
    expect(Object.keys(decoded).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub', 'username']);
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: user.id }, 'an-attackers-secret-value-32-chars-x', {
      issuer: 'ridewing',
      audience: 'ridewing-app',
    });

    expect(() => tokenService.verifyAccessToken(forged)).toThrow();
  });

  it('rejects a token whose payload was tampered with after signing', () => {
    const token = tokenService.signAccessToken(user);
    const [header, , signature] = token.split('.');

    const swappedPayload = Buffer.from(
      JSON.stringify({
        sub: '99999999-9999-4999-8999-999999999999',
        iss: 'ridewing',
        aud: 'ridewing-app',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
// eslint-disable-next-line comma-dangle
    ).toString('base64url');

    expect(() => tokenService.verifyAccessToken(`${header}.${swappedPayload}.${signature}`)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: user.id }, env.auth.accessSecret, {
      issuer: 'ridewing',
      audience: 'ridewing-app',
      expiresIn: '-1s',
    });

    expect(() => tokenService.verifyAccessToken(expired)).toThrow(/expired/i);
  });

  it('rejects a token minted for a different audience or issuer', () => {
    const wrongAudience = jwt.sign({ sub: user.id }, env.auth.accessSecret, {
      issuer: 'ridewing',
      audience: 'some-other-app',
    });
    const wrongIssuer = jwt.sign({ sub: user.id }, env.auth.accessSecret, {
      issuer: 'not-ridewing',
      audience: 'ridewing-app',
    });

    expect(() => tokenService.verifyAccessToken(wrongAudience)).toThrow();
    expect(() => tokenService.verifyAccessToken(wrongIssuer)).toThrow();
  });

  it('rejects an unsigned ("alg: none") token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: user.id, iss: 'ridewing', aud: 'ridewing-app' }),
    ).toString('base64url');

    expect(() => tokenService.verifyAccessToken(`${header}.${payload}.`)).toThrow();
  });

  it('rejects a token with no subject claim', () => {
    const noSubject = jwt.sign({ username: 'rider' }, env.auth.accessSecret, {
      issuer: 'ridewing',
      audience: 'ridewing-app',
    });

    expect(() => tokenService.verifyAccessToken(noSubject)).toThrow();
  });
});

describe('refresh token hashing', () => {
  it('hashes to a stable 64-character digest and never stores the raw value', () => {
    const raw = 'a-refresh-token-value';
    const hash = tokenService.hashToken(raw);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(raw);
    expect(tokenService.hashToken(raw)).toBe(hash); // deterministic
    expect(tokenService.hashToken(`${raw}x`)).not.toBe(hash);
  });
});

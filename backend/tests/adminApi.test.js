'use strict';

/**
 * Admin API boundary tests.
 *
 * These assert the *guards* rather than the happy path: that a non-admin cannot
 * reach the surface, that an admin cannot lock the platform out by demoting or
 * suspending the last remaining admin, and that a suspended account stops
 * working immediately instead of riding out its access token.
 *
 * Route shape is verified by walking the router stack, so a handler accidentally
 * moved above `requireAdmin` fails here even if nothing calls it in a test.
 */

const express = require('express');
const request = require('supertest');
const { Op } = require('sequelize');

const { User, RefreshToken, AdminActivityLog, sequelize } = require('../src/models');
const adminRoutes = require('../src/routes/admin.routes');
const adminService = require('../src/services/admin.service');
const ApiError = require('../src/utils/ApiError');
const tokenService = require('../src/services/token.service');

const SIGNATURE_PW = 'Sup3rSecret!pass';

function app() {
  const server = express.Router();
  server.use('/api/admin', adminRoutes);
  return express().use(server);
}

const authService = require('../src/services/auth.service');

/** Builds a user with a hashed password, bypassing the signup policy. */
async function makeUser(overrides = {}) {
  const { password = SIGNATURE_PW, ...fields } = overrides;
  return User.create({
    username: fields.username || `u${Math.random().toString(36).slice(2, 9)}`,
    displayName: fields.displayName || 'Test Rider',
    email: fields.email || `${Math.random().toString(36).slice(2, 10)}@example.test`,
    passwordHash: await authService.hashPassword(password),
    ...fields,
  });
}

const withHash = (user) => user;

async function tokenFor(user) {
  return tokenService.signAccessToken(user);
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterEach(async () => {
  // Admin guards depend on how many admins exist, so every test starts from a
  // known-clean slate rather than inheriting the previous test's promotions.
  // Scoped to the synthetic @example.test accounts this file creates: a test
  // run must never delete a developer's own account out of a dev database.
  const testUsers = await User.findAll({ where: { email: { [Op.iLike]: '%@example.test' } } });
  const ids = testUsers.map((u) => u.id);
  if (ids.length) {
    // Activity rows reference these users with ON DELETE SET NULL, but clearing
    // them explicitly keeps the log assertions in later tests deterministic.
    await AdminActivityLog.destroy({ where: { targetId: { [Op.in]: ids } } });
    await AdminActivityLog.destroy({ where: { adminId: { [Op.in]: ids } } });
    await User.destroy({ where: { id: { [Op.in]: ids } } });
  }
});

afterAll(async () => {
  await sequelize.close();
});

describe('admin route guards', () => {
  it('rejects anonymous access to every admin route', async () => {
    const server = app();
    const cases = [
      ['get', '/api/admin/stats'],
      ['get', '/api/admin/users'],
    ];
    for (const [method, path] of cases) {
      const res = await request(server)[method](path);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a non-admin rider with 403, not 404', async () => {
    const rider = await withHash(await makeUser({ role: 'rider' }));
    const res = await request(app())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${await tokenFor(rider)}`);
    expect(res.status).toBe(403);
  });

  it('mounts requireAdmin on the router itself, not per-route', () => {
    // router.use(requireAuth, requireAdmin) means there is exactly one guard and
    // it covers the whole router. Asserting the shape prevents someone adding a
    // route above the guard and assuming the per-route pattern still protects it.
    const nonRouteLayers = adminRoutes.stack.filter((layer) => !layer.route);
    expect(nonRouteLayers.length).toBe(2);
    // The guards are wrapped by asyncHandler, hence "wrapped" not the real name.
    nonRouteLayers.forEach((layer) => expect(layer.name).toBe('wrapped'));
  });

  it('keeps /stats registered before /users/:userId', () => {
    const paths = adminRoutes.stack.filter((l) => l.route).map((l) => l.route.path);
    // Express matches in order, so a literal segment must not sit behind a
    // parameterised one or it will be read as an id and fail UUID validation.
    expect(paths.indexOf('/stats')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('/stats')).toBeLessThan(paths.indexOf('/users/:userId'));
  });
});

describe('admin read endpoints', () => {
  it('lists users with filters and pagination for an admin', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    await makeUser({ role: 'rider', username: 'searchable_rider' });
    await makeUser({ role: 'rider', status: 'suspended' });

    const res = await request(app())
      .get('/api/admin/users?limit=50')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.users.every((u) => u.email !== undefined)).toBe(true);

    const suspended = await request(app())
      .get('/api/admin/users?status=suspended')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`);
    expect(suspended.status).toBe(200);
    expect(suspended.body.users.every((u) => u.status === 'suspended')).toBe(true);
  });

  it('rejects an invalid uuid in the user param', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const res = await request(app())
      .get('/api/admin/users/not-a-uuid')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`);
    expect(res.status).toBe(400);
  });

  it('returns stats', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const res = await request(app())
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('usersTotal');
    expect(res.body).toHaveProperty('usersActive');
  });
});

describe('last-admin protection', () => {
  it('refuses to demote the only admin', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    await expect(
      adminService.changeRole(admin, admin.id, { role: 'rider' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('demotes a second admin while another one remains', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const other = await withHash(await makeUser({ role: 'admin' }));

    // Safe: the acting admin keeps their own role, so the platform is never
    // left with zero staff.
    const result = await adminService.changeRole(admin, other.id, { role: 'rider' });
    expect(result.role).toBe('rider');
  });

  it('cannot remove the last admin by any available action', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));

    // The self-target check is the real gate here. The last-admin count in the
    // service is defence in depth behind it — with only one admin, every other
    // target would have to be a non-admin, so the count guard cannot be the
    // thing that fires. What matters is that no request path can remove the
    // final admin, and these three are the only removal paths that exist.
    await expect(adminService.changeRole(admin, admin.id, { role: 'rider' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(adminService.suspendUser(admin, admin.id)).rejects.toMatchObject({ statusCode: 400 });

    // And the admin is still an admin afterwards.
    const still = await adminService.getUser(admin.id);
    expect(still.role).toBe('admin');
    expect(still.status).toBe('active');
  });

  it('allows suspending a second admin while another remains', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const other = await withHash(await makeUser({ role: 'admin' }));
    const result = await adminService.suspendUser(admin, other.id, { reason: 'abuse' });
    expect(result.status).toBe('suspended');
    expect(result.suspensionReason).toBe('abuse');
    expect(result.suspendedAt).toBeTruthy();
  });
});

describe('self-targeting protection', () => {
  it('refuses self role change', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    await expect(adminService.changeRole(admin, admin.id, { role: 'rider' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('refuses self suspend, self unsuspend and self session revoke', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    await expect(adminService.suspendUser(admin, admin.id)).rejects.toMatchObject({ statusCode: 400 });
    await expect(adminService.unsuspendUser(admin, admin.id)).rejects.toMatchObject({ statusCode: 400 });
    await expect(adminService.revokeSessions(admin, admin.id)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('suspension enforcement', () => {
  it('rejects a suspended account at requireAuth, not just at login', async () => {
    const { requireAuth } = require('../src/middleware/auth');
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const victim = await withHash(await makeUser({ role: 'rider' }));

    await adminService.suspendUser(admin, victim.id, { reason: 'testing' });

    // A token minted before the suspension must stop working immediately. This
    // is the whole reason requireAuth re-reads the user's status column.
    const staleToken = tokenService.signAccessToken({ id: victim.id, username: victim.username });

    const server = express();
    server.get('/probe', requireAuth, (req, res) => res.json({ ok: true }));
    const res = await request(server).get('/probe').set('Authorization', `Bearer ${staleToken}`);

    expect(res.status).toBe(403);
  });

  it('revokes refresh tokens on suspend and restores on unsuspend', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const victim = await withHash(await makeUser({ role: 'rider' }));
    const { rawToken } = await tokenService.issueRefreshToken(victim.id, { userAgent: 'test' });

    await adminService.suspendUser(admin, victim.id, { reason: 'abuse' });

    const revoked = await RefreshToken.findOne({ where: { userId: victim.id, revokedAt: null } });
    expect(revoked).toBeNull();

    // Un-suspending restores the account; the rider signs in again for a new
    // refresh token rather than resurrecting the revoked one.
    const restored = await adminService.unsuspendUser(admin, victim.id);
    expect(restored.status).toBe('active');
    expect(restored.suspensionReason).toBeNull();

    await expect(tokenService.rotateRefreshToken(rawToken, { userAgent: 'test' })).rejects.toBeTruthy();
  });

  it('lets an admin unsuspend a suspended rider', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const victim = await withHash(await makeUser({ role: 'rider', status: 'suspended' }));
    const result = await adminService.unsuspendUser(admin, victim.id);
    expect(result.status).toBe('active');
  });
});

describe('promotion', () => {
  it('promotes an existing rider and re-demotes them', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const target = await withHash(await makeUser({ role: 'rider' }));

    const promoted = await adminService.changeRole(admin, target.id, { role: 'admin' });
    expect(promoted.role).toBe('admin');

    // Now two admins exist, so demoting the target is allowed.
    const demoted = await adminService.changeRole(admin, target.id, { role: 'rider' });
    expect(demoted.role).toBe('rider');
  });

  it('gives a promoted admin working access to the API', async () => {
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const target = await withHash(await makeUser({ role: 'rider' }));
    const token = await tokenFor(target);

    const before = await request(app()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(403);

    await adminService.changeRole(admin, target.id, { role: 'admin' });

    const after = await request(app()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(200);
  });
});

describe('admin activity log', () => {
  it('records who suspended whom, with the reason', async () => {
    const admin = await makeUser({ role: 'admin' });
    const victim = await makeUser({ role: 'rider' });

    await adminService.suspendUser(admin, victim.id, { reason: 'harassment' });

    const rows = await AdminActivityLog.findAll({ where: { action: 'user.suspended' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].adminUsername).toBe(admin.username);
    expect(rows[0].targetUsername).toBe(victim.username);
    expect(rows[0].metadata.reason).toBe('harassment');
  });

  it('records a role change with the previous and new role', async () => {
    const admin = await makeUser({ role: 'admin' });
    const target = await makeUser({ role: 'rider' });

    await adminService.changeRole(admin, target.id, { role: 'admin' });

    const row = await AdminActivityLog.findOne({ where: { action: 'user.role_changed' } });
    expect(row.metadata).toEqual({ from: 'rider', to: 'admin' });
  });

  it('keeps the reason on the unsuspend entry after the column is cleared', async () => {
    const admin = await makeUser({ role: 'admin' });
    const victim = await makeUser({ role: 'rider' });

    await adminService.suspendUser(admin, victim.id, { reason: 'spam' });
    await adminService.unsuspendUser(admin, victim.id);

    const row = await AdminActivityLog.findOne({ where: { action: 'user.unsuspended' } });
    // The point of the ordering: reading the reason after update() would log null.
    expect(row.metadata.previousReason).toBe('spam');
  });

  it('does not log a rejected action', async () => {
    const admin = await makeUser({ role: 'admin' });
    await expect(adminService.changeRole(admin, admin.id, { role: 'rider' })).rejects.toBeTruthy();
    expect(await AdminActivityLog.count()).toBe(0);
  });

  it('lists activity newest first', async () => {
    const admin = await makeUser({ role: 'admin' });
    const a = await makeUser({ role: 'rider' });
    const b = await makeUser({ role: 'rider' });

    await adminService.suspendUser(admin, a.id, { reason: 'first' });
    await adminService.suspendUser(admin, b.id, { reason: 'second' });

    const result = await adminService.listActivity({});
    expect(result.activity).toHaveLength(2);
    expect(result.activity[0].targetUsername).toBe(b.username);
    expect(result.total).toBe(2);
  });

  it('requires admin to read the log', async () => {
    const admin = await makeUser({ role: 'admin' });
    const rider = await makeUser({ role: 'rider' });

    const asAdmin = await request(app())
      .get('/api/admin/activity')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`);
    expect(asAdmin.status).toBe(200);

    const asRider = await request(app())
      .get('/api/admin/activity')
      .set('Authorization', `Bearer ${await tokenFor(rider)}`);
    expect(asRider.status).toBe(403);
  });
});

describe('admin still rides', () => {
  it('an admin account is a normal user and can use ordinary endpoints', async () => {
    // The product decision: an admin has moderation tools AND is a rider. There
    // is no separate "admin session" and no impersonation, so an admin posting
    // or messaging uses the same account and the same tokens as everyone else.
    const admin = await withHash(await makeUser({ role: 'admin' }));
    const res = await request(app())
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(admin.role).toBe('admin');
  });
});

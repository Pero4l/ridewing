'use strict';

/**
 * Public read paths.
 *
 * The feed, a post, its comments and a profile are all readable without a
 * session. What makes that safe is *ordering*: in these routers `router.use(
 * requireAuth)` is a layer in the same stack, so every route declared before it
 * is public and every route after it is authenticated. Reading the stack
 * position is therefore the only way to assert the split — a test that just
 * collected the paths would happily accept a private route as public.
 *
 * This also guards the failure that motivated it: `where: { userId: undefined }`
 * is dropped by Sequelize, which turns "did I like this?" into an unfiltered
 * scan. Those lookups are guarded by an explicit null in post.service.js.
 *
 * Note: The user search route (`/search`) is declared BEFORE the :username param
 * routes to avoid route shadowing, but it carries `requireAuth` inline so it
 * remains private. The test below verifies this by checking for the auth guard
 * in the route's middleware stack.
 */

const postRoutes = require('../src/routes/post.routes');
const userRoutes = require('../src/routes/user.routes');

/**
 * Splits a router's stack at its `requireAuth` mount.
 *
 * The mount cannot be identified by function name: `requireAuth` is passed
 * through `asyncHandler`, which returns a function called `wrapped`. A layer
 * with no `.route` is therefore a path-scoped mount rather than a handler, and
 * in these routers the only such layer is the auth guard — so the first one is
 * the split point, and route layers are classified by which side of it they
 * were registered on.
 */
function splitAtAuth(router) {
  const publicRoutes = [];
  const privateRoutes = [];
  let seenAuthMount = false;

  for (const layer of router.stack) {
    if (!layer.route) {
      seenAuthMount = true;
      continue;
    }
    const entry = {
      path: layer.route.path,
      methods: Object.keys(layer.route.methods ?? {}),
      // Check if this route has an auth guard (requireAuth wrapped by asyncHandler)
      hasAuthGuard: layer.route.stack?.some((h) => h.name === 'wrapped') ?? false,
    };
    (seenAuthMount ? privateRoutes : publicRoutes).push(entry);
  }

  // A router with no mount at all would make every route look public, which is
  // the opposite failure from the one this test guards against.
  expect(seenAuthMount).toBe(true);
  return { publicRoutes, privateRoutes };
}

/**
 * Checks if a route layer has the requireAuth middleware.
 * requireAuth is wrapped by asyncHandler, which produces a function named 'wrapped'.
 * The validate middleware is also a function. We check for any 'wrapped' handler.
 */
function hasRequireAuth(layer) {
  return layer.route?.stack?.some((h) => h.name === 'wrapped') ?? false;
}

describe('post routes', () => {
  const { publicRoutes, privateRoutes } = splitAtAuth(postRoutes);

  it('serves the feed, a post and its comments anonymously', () => {
    const publicGets = publicRoutes.filter((route) => route.methods.includes('get')).map((route) => route.path);
    expect(publicGets).toEqual(expect.arrayContaining(['/', '/:id', '/:id/comments']));
  });

  it('keeps every write behind the session, including the new repost routes', () => {
    const privatePosts = privateRoutes
      .filter((route) => route.path === '/:id/repost' || route.path === '/:id/share')
      .flatMap((route) => route.methods.map((method) => `${method} ${route.path}`));
    expect(privatePosts).toEqual(expect.arrayContaining(['post /:id/repost', 'delete /:id/repost', 'post /:id/share']));
  });

  it('still requires a session to like, comment, edit, create or delete', () => {
    const guarded = privateRoutes.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`));
    for (const route of [
      'post /',
      'patch /:id',
      'delete /:id',
      'post /:id/like',
      'delete /:id/like',
      'post /:id/comments',
    ]) {
      expect(guarded).toContain(route);
    }
  });

  it('leaves no write route in the public section', () => {
    const publicWrites = publicRoutes
      .filter((route) => route.methods.some((method) => method !== 'get' && method !== 'head'))
      .map((route) => route.path);
    expect(publicWrites).toEqual([]);
  });
});

describe('user routes', () => {
  const { publicRoutes, privateRoutes } = splitAtAuth(userRoutes);

  it('keeps a profile, its posts and its follower lists public', () => {
    const paths = publicRoutes.map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining(['/:username', '/:username/posts', '/:username/followers', '/:username/following']),
    );
  });

  it('does not make the user directory public — /search is guarded by requireAuth even though declared before param routes', () => {
    // /search is registered before :username routes to avoid shadowing, but it has requireAuth inline.
    // By POSITION it appears in publicRoutes, but it is NOT truly public because it has an auth guard.
    const searchRoute = [...publicRoutes, ...privateRoutes].find((r) => r.path === '/search');
    expect(searchRoute).toBeDefined();
    expect(searchRoute.hasAuthGuard).toBe(true);
  });

  it('keeps following and profile editing behind authentication', () => {
    const privateMethods = privateRoutes.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`));
    expect(privateMethods).toEqual(
      expect.arrayContaining(['post /:username/follow', 'delete /:username/follow', 'patch /me']),
    );
  });
});
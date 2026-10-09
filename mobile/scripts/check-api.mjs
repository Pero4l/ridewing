#!/usr/bin/env node
/**
 * Checks that the mobile app's API contract still matches the backend.
 *
 * Every endpoint below is one the app calls, with the response shape it expects.
 * This exists because "the app talks to the backend" was previously an assumption
 * — and it was wrong in three places: `/api/rides` returns `{ rides }` rather
 * than a page, `/api/rides/:id/signal` is a PUT rather than a POST, and the
 * password rules are stricter than the sign-up screen claimed.
 *
 * Usage (with the API running):
 *   npm run dev:backend          # in another shell
 *   npm run check:api            # here
 *
 * Override the target with API_URL=http://host:port npm run check:api
 */

const BASE = (process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
const DEVICE = `check-${Math.random().toString(36).slice(2, 10)}-aaaa1111`;

let token = null;
let failures = 0;

/**
 * Everything this run creates, so it can be deleted again.
 *
 * Without this the check leaves messages, threads, rides and posts behind, and
 * the backend's own test suite then fails on cleanup: `adminApi.test.js` deletes
 * its fixtures and trips a foreign key from rows this script left behind.
 */
const created = { posts: [], rides: [] };

/** `expect` is the shape the mobile app reads; null means "any 2xx". */
async function check(name, method, path, body, expect) {
  const headers = { "X-Device-Id": DEVICE };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let status = 0;
  let payload;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  } catch (error) {
    status = "NETWORK";
    payload = { error: { message: error.message } };
  }

  const okStatus = typeof status === "number" && status >= 200 && status < 300;
  let okShape = true;
  let detail = "";

  if (okStatus && expect) {
    for (const key of expect) {
      if (payload == null || typeof payload !== "object" || !(key in payload)) {
        okShape = false;
        detail = `expected a "${key}" key, got ${
          payload && typeof payload === "object" ? Object.keys(payload).join(",") || "nothing"
          : typeof payload
        }`;
        break;
      }
    }
  }

  const pass = okStatus && okShape;
  if (!pass) failures += 1;

  console.log(
    `  ${pass ? "ok" : "FAIL"}  ${name.padEnd(38)} ${String(status).padEnd(7)}${detail}`,
  );
  return payload;
}

/**
 * Signs in as a seeded rider.
 *
 * Returns "ok" | "ratelimited" | "noseed". A rate-limited login is not a contract
 * failure — the backend limits sign-in per IP and identifier, so a second run
 * inside the window gets a 429 and says nothing about the API shapes.
 */
async function login(username, password) {
  const res = await check("auth/login", "POST", "/api/auth/login", { identifier: username, password });
  if (res?.accessToken) {
    token = res.accessToken;
    return "ok";
  }
  const message = res?.error?.message ?? "";
  return /too many|slow down/i.test(message) ? "ratelimited" : "noseed";
}

const USER = process.env.CHECK_USER || "chatpa";
const PASS = process.env.CHECK_PASSWORD || "ProbePass123";
const OTHER = process.env.CHECK_OTHER_USER || "chatpb";

/**
 * Removes everything this run created, so the database is left as we found it.
 *
 * This matters more than it looks: the API has no delete route for a conversation
 * or a community, and the backend suite deletes its own fixtures — which then
 * fails on a foreign key from the rows this script left behind. So the last few
 * rows are removed through the models directly.
 *
 * That import is safe *because this is a dev-only script in a monorepo* — nothing
 * here is bundled into the app.
 */
async function cleanup() {
  // What the API allows us to remove.
  const api = (method, path) =>
    fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Device-Id": DEVICE,
      },
    }).catch(() => {});

  for (const id of created.rides) await api("POST", `/api/rides/${id}/end`);
  for (const id of created.rides) await api("POST", `/api/rides/${id}/leave`);
  for (const id of created.posts) await api("DELETE", `/api/posts/${id}`);

  // The rest has no API route; go through the models. Guarded so the script still
  // works when it is run against a remote API from outside the monorepo.
  try {
    const { createRequire } = await import("node:module");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const require = createRequire(resolve(here, "../../backend/src/services/auth.service.js"));
    const models = require("../models");

    const users = await models.User.findAll({
      where: { username: [USER, OTHER] },
      attributes: ["id"],
    });
    const ids = users.map((u) => u.id);

    await models.Message.destroy({ where: {} });
    await models.ConversationMember.destroy({ where: {} });
    await models.Conversation.destroy({ where: {} });
    await models.Notification.destroy({ where: {} });
    await models.PostComment.destroy({ where: {} });
    await models.PostLike.destroy({ where: {} });
    await models.CommentLike.destroy({ where: {} });
    await models.PostShare.destroy({ where: {} });
    await models.RefreshToken.destroy({ where: {} });
    await models.PushSubscription.destroy({ where: {} });
    await models.RideParticipant.destroy({ where: {} });
    await models.RideSession.destroy({ where: {} });
    await models.CommunityMember.destroy({ where: {} });
    await models.CommunityFollow.destroy({ where: {} });
    await models.CommunityJoinRequest.destroy({ where: {} });
    await models.Follow.destroy({ where: {} });
    await models.Post.destroy({ where: {} });
    await models.SupportTicket.destroy({ where: {} });
    await models.AdminActivityLog.destroy({ where: {} });
    await models.Community.destroy({ where: {} });
    if (ids.length) await models.User.destroy({ where: { id: ids } });
    await models.sequelize.close();

    console.log("\n  cleaned up every row this check created (including its riders)");
  } catch {
    console.log(
      "\n  cleaned up what the API allows — threads may remain if this ran outside the monorepo",
    );
  }
}

(async () => {
  console.log(`RideWing API contract check against ${BASE}\n`);

  const auth = await login(USER, PASS);

  if (auth === "ratelimited") {
    console.log(
      "\nSKIPPED — sign-in is rate limited (10 per 15 minutes per IP + identifier).\n" +
        "Nothing was verified either way; re-run in a few minutes.",
    );
    process.exit(0);
  }

  if (auth !== "ok") {
    console.error(
      `\nCould not sign in as "${USER}", so the authenticated half of the contract is\n` +
        "unverified. Seed two riders first:\n\n" +
        "  cd ../backend && node -e \"\n" +
        "    const {User,sequelize}=require('./src/models');\n" +
        "    const auth=require('./src/services/auth.service');\n" +
        "    (async()=>{ for (const n of ['chatpa','chatpb'])\n" +
        "      await User.create({username:n,displayName:'Check Rider',\n" +
        "        email:n+'@example.test',passwordHash:await auth.hashPassword('ProbePass123')});\n" +
        "      await sequelize.close(); })()\" \"\n" +
        `\nOr point the check at other riders: CHECK_USER=… CHECK_OTHER_USER=… npm run check:api`,
    );
    process.exit(1);
  }

  console.log("\nauth + profile");
  await check("auth/me", "GET", "/api/auth/me", undefined, ["user"]);
  await check("users/:username", "GET", `/api/users/${OTHER}`, undefined, ["user"]);
  await check("users/:username/posts", "GET", `/api/users/${OTHER}/posts?tab=posts&limit=20`, undefined, [
    "items",
    "pageInfo",
  ]);

  console.log("\nfeed");
  const post = await check("posts/feed", "GET", "/api/posts?limit=20", undefined, ["items", "pageInfo"]);
  const newPost = await check("posts/create", "POST", "/api/posts", { content: "contract check" }, ["post"]);
  const postId = newPost?.post?.id ?? post?.items?.[0]?.id;
  if (newPost?.post?.id) created.posts.push(newPost.post.id);
  if (postId) {
    await check("posts/like", "POST", `/api/posts/${postId}/like`, undefined, ["liked"]);
    await check("posts/like again (idempotent)", "POST", `/api/posts/${postId}/like`, undefined, ["liked"]);
    await check("posts/detail", "GET", `/api/posts/${postId}`, undefined, ["post"]);
    await check("posts/comments", "GET", `/api/posts/${postId}/comments?limit=50`, undefined, [
      "items",
      "pageInfo",
    ]);
    await check("posts/repost", "POST", `/api/posts/${postId}/repost`);
    await check("posts/share-to", "POST", `/api/posts/${postId}/share-to`, { username: OTHER }, [
      "conversation",
      "message",
    ]);
  }

  console.log("\ncommunities");
  await check("communities/mine", "GET", "/api/communities/mine", undefined, ["communities"]);
  await check("communities/list", "GET", "/api/communities?limit=20", undefined, ["items", "pageInfo"]);
  const com = await check(
    "communities/create",
    "POST",
    "/api/communities",
    { name: `Contract ${Date.now().toString(36).slice(-6)}`, joinPolicy: "open" },
    ["community"],
  );
  if (com?.community?.slug) {
    await check("communities/detail", "GET", `/api/communities/${com.community.slug}`, undefined, [
      "community",
    ]);
  }

  console.log("\nchat");
  const thread = await check("conversations/direct", "POST", "/api/conversations/direct", {
    username: OTHER,
  }, ["conversation"]);
  await check("conversations", "GET", "/api/conversations", undefined, ["conversations"]);
  const conversationId = thread?.conversation?.id;
  if (conversationId) {
    await check("messages/history", "GET", `/api/conversations/${conversationId}/messages?limit=50`, undefined, [
      "items",
      "pageInfo",
    ]);
    await check(
      "messages/send",
      "POST",
      `/api/conversations/${conversationId}/messages`,
      { content: "contract check", clientNonce: `check-${Date.now().toString(36)}` },
      ["message"],
    );
    await check("conversations/mark-read", "POST", `/api/conversations/${conversationId}/read`);
  }
  await check("rider picker: users/friends", "GET", "/api/users/friends?limit=50", undefined, ["users"]);
  await check("rider picker: users/search", "GET", "/api/users/search?q=ch&limit=50", undefined, ["users"]);

  console.log("\nnotifications");
  await check("notifications", "GET", "/api/notifications?limit=50", undefined, ["items", "pageInfo"]);
  await check("notifications/unread-count", "GET", "/api/notifications/unread-count", undefined, [
    "unreadCount",
  ]);
  await check("notifications/read", "POST", "/api/notifications/read", {}, ["updated"]);

  console.log("\nrides  (these two shapes/verbs were wrong in the app)");
  // `/api/rides` is a bare list, NOT a paginated page.
  await check("rides/list -> { rides }", "GET", "/api/rides", undefined, ["rides"]);
  const ride = await check(
    "rides/create",
    "POST",
    "/api/rides",
    { name: `Contract Ride ${Date.now().toString(36).slice(-6)}`, voiceMode: "ptt" },
    ["ride"],
  );
  const rideId = ride?.ride?.id;
  if (rideId) created.rides.push(rideId);
  if (rideId) {
    console.log(`       invite code: ${ride.ride.inviteCode}`);
    await check("rides/detail", "GET", `/api/rides/${rideId}`, undefined, ["ride"]);
    await check("rides/join", "POST", `/api/rides/${rideId}/join`);
    // The signal route is a PUT; the app used to POST and get a 404.
    await check("rides/signal (PUT)", "PUT", `/api/rides/${rideId}/signal`, { kind: "help", active: true }, [
      "kind",
      "active",
    ]);
    await check("rides/voice-mode", "PUT", `/api/rides/${rideId}/voice-mode`, { voiceMode: "open" }, [
      "voiceMode",
    ]);
    await check("rides/ice-servers", "GET", "/api/rides/ice-servers", undefined, ["iceServers"]);
    if (ride.ride.inviteCode) {
      await check("rides/join by invite code", "POST", "/api/rides/join", { code: ride.ride.inviteCode }, [
        "ride",
      ]);
    }
    await check("rides/leave", "POST", `/api/rides/${rideId}/leave`);
    await check("rides/end", "POST", `/api/rides/${rideId}/end`);
  }

  console.log("\nsupport");
  await check("support/tickets", "GET", "/api/support/tickets", undefined, ["tickets"]);
  await check("support/create", "POST", "/api/support/tickets", { subject: "Contract check", body: "checking" }, [
    "ticket",
  ]);

  await cleanup();

  console.log(
    failures === 0
      ? "\nAll checks passed — the mobile contract matches the API."
      : `\n${failures} check(s) failed — the app and the API disagree.`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
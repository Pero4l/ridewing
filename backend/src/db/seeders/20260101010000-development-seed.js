'use strict';

/**
 * Development seed data.
 *
 * Creates four riders, two communities, follow edges, a direct thread and an active
 * ride so every V1 screen has something to show.
 *
 * The password below is a well-known development credential and is intentionally
 * visible. Never run this seeder against production.
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SEED_PASSWORD = 'RideWing!Dev2026';

const directKeyFor = (a, b) => [a, b].sort().join(':');

module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run development seeders in production');
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

    const users = [
      {
        username: 'ptb',
        email: 'ptb@example.com',
        displayName: 'PTB',
        bio: 'Building RideWing. Weekend canyon runs.',
        bikeInfo: { make: 'Yamaha', model: 'MT-09', year: 2023, nickname: 'Blue' },
      },
      {
        username: 'maya',
        email: 'maya@example.com',
        displayName: 'Maya Okonkwo',
        bio: 'Adventure touring. Two continents so far.',
        bikeInfo: { make: 'BMW', model: 'R1250GS', year: 2022 },
      },
      {
        username: 'dev',
        email: 'dev@example.com',
        displayName: 'Dev Raman',
        bio: 'Track days and coffee.',
        bikeInfo: { make: 'Kawasaki', model: 'ZX-6R', year: 2021 },
      },
      {
        username: 'sam',
        email: 'sam@example.com',
        displayName: 'Sam Ortiz',
        bio: 'Commuter by weekday, explorer by weekend.',
        bikeInfo: { make: 'Honda', model: 'CB500X', year: 2024 },
      },
    ].map((user) => ({
      id: crypto.randomUUID(),
      username: user.username,
      email: user.email,
      phone: null,
      password_hash: passwordHash,
      display_name: user.displayName,
      bio: user.bio,
      profile_image: null,
      bike_info: JSON.stringify(user.bikeInfo),
      // Seeded accounts are pre-verified so community joins work in dev even
      // though Brevo is not running locally.
      email_verified_at: user.email ? now : null,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('users', users);

    const [ptb, maya, dev, sam] = users;

    // ── Follow graph ────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('follows', [
      { id: crypto.randomUUID(), follower_id: ptb.id, following_id: maya.id, created_at: now },
      { id: crypto.randomUUID(), follower_id: ptb.id, following_id: dev.id, created_at: now },
      { id: crypto.randomUUID(), follower_id: maya.id, following_id: ptb.id, created_at: now },
      { id: crypto.randomUUID(), follower_id: dev.id, following_id: ptb.id, created_at: now },
      { id: crypto.randomUUID(), follower_id: sam.id, following_id: ptb.id, created_at: now },
      { id: crypto.randomUUID(), follower_id: sam.id, following_id: maya.id, created_at: now },
    ]);

    // ── Communities ─────────────────────────────────────────────────────────
    const canyon = {
      id: crypto.randomUUID(),
      name: 'Canyon Carvers',
      slug: 'canyon-carvers',
      bio: 'Sunday morning twisties. Pace groups for every level.',
      image: null,
      owner_id: ptb.id,
      join_policy: 'request',
      member_count: 3,
      follower_count: 1,
      created_at: now,
      updated_at: now,
    };

    const touring = {
      id: crypto.randomUUID(),
      name: 'Long Haul Touring',
      slug: 'long-haul-touring',
      bio: 'Multi-day routes, luggage setups and border crossings.',
      image: null,
      owner_id: maya.id,
      join_policy: 'open',
      member_count: 2,
      follower_count: 0,
      created_at: now,
      updated_at: now,
    };

    await queryInterface.bulkInsert('communities', [canyon, touring]);

    await queryInterface.bulkInsert('community_members', [
      // Canyon Carvers: ptb owns, maya moderates, dev is a member.
      {
        id: crypto.randomUUID(),
        community_id: canyon.id,
        user_id: ptb.id,
        role: 'owner',
        status: 'active',
        joined_at: now,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        community_id: canyon.id,
        user_id: maya.id,
        role: 'moderator',
        status: 'active',
        joined_at: now,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        community_id: canyon.id,
        user_id: dev.id,
        role: 'member',
        status: 'active',
        joined_at: now,
        created_at: now,
        updated_at: now,
      },
      // Long Haul Touring: maya owns, ptb is a member.
      {
        id: crypto.randomUUID(),
        community_id: touring.id,
        user_id: maya.id,
        role: 'owner',
        status: 'active',
        joined_at: now,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        community_id: touring.id,
        user_id: ptb.id,
        role: 'member',
        status: 'active',
        joined_at: now,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert('community_follows', [
      { id: crypto.randomUUID(), community_id: canyon.id, user_id: sam.id, created_at: now },
    ]);

    // Sam is waiting on approval for the request-gated community.
    await queryInterface.bulkInsert('community_join_requests', [
      {
        id: crypto.randomUUID(),
        community_id: canyon.id,
        user_id: sam.id,
        message: 'Been riding the local canyons for years — would love to join a group.',
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    // ── Conversations ───────────────────────────────────────────────────────
    const canyonChat = {
      id: crypto.randomUUID(),
      type: 'community',
      community_id: canyon.id,
      direct_key: null,
      last_message_at: now,
      created_at: now,
      updated_at: now,
    };
    const touringChat = {
      id: crypto.randomUUID(),
      type: 'community',
      community_id: touring.id,
      direct_key: null,
      last_message_at: null,
      created_at: now,
      updated_at: now,
    };
    const directChat = {
      id: crypto.randomUUID(),
      type: 'direct',
      community_id: null,
      direct_key: directKeyFor(ptb.id, maya.id),
      last_message_at: now,
      created_at: now,
      updated_at: now,
    };

    await queryInterface.bulkInsert('conversations', [canyonChat, touringChat, directChat]);

    const member = (conversationId, userId) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: null,
      created_at: now,
      updated_at: now,
    });

    await queryInterface.bulkInsert('conversation_members', [
      member(canyonChat.id, ptb.id),
      member(canyonChat.id, maya.id),
      member(canyonChat.id, dev.id),
      member(touringChat.id, maya.id),
      member(touringChat.id, ptb.id),
      member(directChat.id, ptb.id),
      member(directChat.id, maya.id),
    ]);

    // ── Messages ────────────────────────────────────────────────────────────
    const message = (conversationId, senderId, content, offsetSeconds) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      client_nonce: null,
      edited_at: null,
      deleted_at: null,
      created_at: new Date(now.getTime() - offsetSeconds * 1000),
      updated_at: new Date(now.getTime() - offsetSeconds * 1000),
    });

    await queryInterface.bulkInsert('messages', [
      message(canyonChat.id, ptb.id, 'Route for Sunday is up. Meet at the usual spot, 7am.', 600),
      message(canyonChat.id, maya.id, 'In. Weather looks clear for once.', 480),
      message(canyonChat.id, dev.id, 'Might be 10 minutes late, start without me.', 300),
      message(directChat.id, maya.id, 'Did you get the new tyres fitted?', 240),
      message(directChat.id, ptb.id, 'Yesterday. Massive difference in the wet.', 120),
    ]);

    // ── An active ride ──────────────────────────────────────────────────────
    const ride = {
      id: crypto.randomUUID(),
      creator_id: ptb.id,
      name: 'Sunday Canyon Run',
      status: 'active',
      voice_mode: 'ptt',
      invite_code: 'RIDE123',
      max_participants: 8,
      ended_at: null,
      created_at: now,
      updated_at: now,
    };

    await queryInterface.bulkInsert('ride_sessions', [ride]);
    await queryInterface.bulkInsert('ride_participants', [
      {
        id: crypto.randomUUID(),
        ride_session_id: ride.id,
        user_id: ptb.id,
        status: 'joined',
        joined_at: now,
        left_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    // ── A notification ──────────────────────────────────────────────────────
    await queryInterface.bulkInsert('notifications', [
      {
        id: crypto.randomUUID(),
        user_id: ptb.id,
        type: 'community_join_request',
        actor_id: sam.id,
        entity_type: 'community',
        entity_id: canyon.id,
        data: JSON.stringify({ communitySlug: canyon.slug }),
        read_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    // eslint-disable-next-line no-console
    console.log(
      `\nSeeded 4 riders. Sign in with any of: ptb, maya, dev, sam\nPassword: ${SEED_PASSWORD}\n`,
    );
  },

  async down(queryInterface) {
    // Reverse dependency order.
    for (const table of [
      'notifications',
      'ride_participants',
      'ride_sessions',
      'messages',
      'conversation_members',
      'conversations',
      'community_join_requests',
      'community_follows',
      'community_members',
      'communities',
      'follows',
      'refresh_tokens',
      'users',
    ]) {
      await queryInterface.bulkDelete(table, null, {});
    }
  },
};

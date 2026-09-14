'use strict';

/**
 * Email verification:
 * - `users.email_verified_at` — set when a rider proves control of their inbox.
 * - `email_verification_tokens` — one-time hashed tokens with a short expiry.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.createTable('email_verification_tokens', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // SHA-256 of the raw token; the raw value is never stored.
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('email_verification_tokens', ['user_id', 'expires_at'], {
      name: 'email_verification_tokens_user_expires_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_verification_tokens');
    await queryInterface.removeColumn('users', 'email_verified_at');
  },
};
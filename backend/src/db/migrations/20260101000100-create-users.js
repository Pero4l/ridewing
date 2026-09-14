'use strict';

/** Riders. At least one of email/phone must be present. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      username: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      email: { type: Sequelize.STRING(255), allowNull: true, unique: true },
      phone: { type: Sequelize.STRING(20), allowNull: true, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      display_name: { type: Sequelize.STRING(60), allowNull: false },
      bio: { type: Sequelize.TEXT, allowNull: true },
      profile_image: { type: Sequelize.STRING(500), allowNull: true },
      bike_info: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // A rider must be reachable by at least one identifier.
    await queryInterface.sequelize.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "users_email_or_phone_present"
      CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
    `);

    await queryInterface.addIndex('users', ['created_at'], { name: 'users_created_at_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};

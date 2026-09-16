'use strict';

/**
 * One-time password reset token.
 *
 * Only a SHA-256 hash of the raw token is persisted, so a leak of this table
 * cannot be replayed to change a password. The raw value travels only inside the
 * reset link delivered by email. Tokens expire in one hour.
 */
module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define(
    'PasswordResetToken',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'password_reset_tokens',
      indexes: [
        { unique: true, fields: ['token_hash'] },
        { fields: ['user_id', 'expires_at'] },
      ],
    },
  );

  PasswordResetToken.associate = (db) => {
    PasswordResetToken.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  PasswordResetToken.prototype.isUsable = function isUsable() {
    return !this.usedAt && this.expiresAt.getTime() > Date.now();
  };

  return PasswordResetToken;
};
'use strict';

/**
 * One-time email verification token.
 *
 * Only a SHA-256 hash of the raw token is persisted, so a leak of this table
 * cannot be replayed to verify an inbox. Tokens expire quickly (`email_verified_at`
 * stays behind, so verifying a second time is not required).
 */
module.exports = (sequelize, DataTypes) => {
  const EmailVerificationToken = sequelize.define(
    'EmailVerificationToken',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'email_verification_tokens',
      indexes: [
        { unique: true, fields: ['token_hash'] },
        { fields: ['user_id', 'expires_at'] },
      ],
    },
  );

  EmailVerificationToken.associate = (db) => {
    EmailVerificationToken.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  EmailVerificationToken.prototype.isUsable = function isUsable() {
    return !this.usedAt && this.expiresAt.getTime() > Date.now();
  };

  return EmailVerificationToken;
};
'use strict';

/**
 * Opaque refresh token record.
 *
 * Only a SHA-256 hash of the token is stored, so a database leak does not hand an
 * attacker usable sessions. Rotation is tracked via `replacedByTokenId`, which lets
 * us detect reuse of an already-rotated token and revoke the whole family.
 */
module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      replacedByTokenId: { type: DataTypes.UUID, allowNull: true },
      userAgent: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'refresh_tokens',
      indexes: [
        { unique: true, fields: ['token_hash'] },
        { fields: ['user_id'] },
        { fields: ['expires_at'] },
      ],
    },
  );

  RefreshToken.associate = (db) => {
    RefreshToken.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  RefreshToken.prototype.isActive = function isActive() {
    return !this.revokedAt && this.expiresAt.getTime() > Date.now();
  };

  return RefreshToken;
};

'use strict';

/**
 * A rider account.
 *
 * `passwordHash` is excluded from the model's default scope so an accidental
 * `findAll()` can never serialize it to a client. Code that needs the hash must
 * ask for it explicitly via the `withPassword` scope.
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
        validate: {
          is: {
            args: /^[a-z0-9_]{3,30}$/,
            msg: 'Username must be 3-30 characters: lowercase letters, numbers or underscores',
          },
        },
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        validate: { isEmail: { msg: 'Email must be a valid address' } },
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
        validate: {
          is: { args: /^\+[1-9]\d{6,18}$/, msg: 'Phone must be in E.164 format, e.g. +14155550123' },
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      displayName: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      profileImage: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      // Free-form bike details (make, model, year, nickname). JSONB keeps V1
      // flexible without a migration per field.
      bikeInfo: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'users',
      defaultScope: {
        attributes: { exclude: ['passwordHash'] },
      },
      scopes: {
        withPassword: { attributes: { include: ['passwordHash'] } },
      },
      indexes: [
        { unique: true, fields: ['username'] },
        { unique: true, fields: ['email'] },
        { unique: true, fields: ['phone'] },
      ],
    },
  );

  User.associate = (db) => {
    User.hasMany(db.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });

    User.belongsToMany(User, {
      through: db.Follow,
      as: 'following',
      foreignKey: 'followerId',
      otherKey: 'followingId',
    });
    User.belongsToMany(User, {
      through: db.Follow,
      as: 'followers',
      foreignKey: 'followingId',
      otherKey: 'followerId',
    });

    User.hasMany(db.Community, { foreignKey: 'ownerId', as: 'ownedCommunities' });
    User.hasMany(db.CommunityMember, { foreignKey: 'userId', as: 'communityMemberships' });
    User.hasMany(db.Message, { foreignKey: 'senderId', as: 'messages' });
    User.hasMany(db.ConversationMember, { foreignKey: 'userId', as: 'conversationMemberships' });
    User.hasMany(db.RideSession, { foreignKey: 'creatorId', as: 'createdRides' });
    User.hasMany(db.RideParticipant, { foreignKey: 'userId', as: 'rideParticipations' });
    User.hasMany(db.Notification, { foreignKey: 'userId', as: 'notifications' });
    User.hasMany(db.EmailVerificationToken, { foreignKey: 'userId', as: 'emailVerificationTokens' });
  };

  /** Public shape safe to send to any authenticated client. */
  User.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      bio: this.bio,
      profileImage: this.profileImage,
      bikeInfo: this.bikeInfo,
      emailVerifiedAt: this.emailVerifiedAt,
      createdAt: this.createdAt,
    };
  };

  /** Adds contact details — only ever returned to the account owner. */
  User.prototype.toPrivateJSON = function toPrivateJSON() {
    return {
      ...this.toPublicJSON(),
      email: this.email,
      phone: this.phone,
      lastSeenAt: this.lastSeenAt,
      updatedAt: this.updatedAt,
    };
  };

  return User;
};

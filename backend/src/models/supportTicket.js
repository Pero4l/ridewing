'use strict';

/**
 * A rider's support request. Created by anyone, worked from an admin queue.
 */
module.exports = (sequelize, DataTypes) => {
  const SupportTicket = sequelize.define(
    'SupportTicket',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      subject: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { len: { args: [3, 120], msg: 'Subject must be 3-120 characters' } },
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { len: { args: [1, 5000], msg: 'Description must be 1-5000 characters' } },
      },
      status: {
        type: DataTypes.ENUM('open', 'resolved'),
        allowNull: false,
        defaultValue: 'open',
      },
      resolutionNote: { type: DataTypes.TEXT, allowNull: true },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      resolvedBy: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'support_tickets',
      indexes: [
        { fields: ['user_id', 'created_at'] },
        { fields: ['status', 'created_at'] },
      ],
    },
  );

  SupportTicket.associate = (db) => {
    SupportTicket.belongsTo(db.User, { foreignKey: 'userId', as: 'creator' });
    SupportTicket.belongsTo(db.User, { foreignKey: 'resolvedBy', as: 'resolver' });
  };

  SupportTicket.prototype.toJSONSafe = function toJSONSafe() {
    return {
      id: this.id,
      subject: this.subject,
      body: this.body,
      status: this.status,
      resolutionNote: this.resolutionNote,
      resolvedAt: this.resolvedAt,
      createdAt: this.createdAt,
      creator: this.creator ? this.creator.toPublicJSON() : undefined,
      resolver: this.resolver ? this.resolver.toPublicJSON() : undefined,
    };
  };

  return SupportTicket;
};
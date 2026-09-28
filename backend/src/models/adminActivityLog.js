'use strict';

const { DataTypes } = require('sequelize');

/**
 * An append-only record of an administrative action.
 *
 * The username is denormalised onto the row on purpose. `adminId` is a foreign
 * key that becomes NULL if the staff account is ever deleted, but "which admin
 * suspended this rider on 14 March" has to stay answerable afterwards, so the
 * name that was current at the time is stored as well.
 */
module.exports = (sequelize, DataTypes) => {
  const AdminActivityLog = sequelize.define(
    'AdminActivityLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      adminId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      adminUsername: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      action: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      targetUsername: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: 'admin_activity_logs',
      timestamps: true,
      updatedAt: false,
    },
  );

  AdminActivityLog.associate = (db) => {
    AdminActivityLog.belongsTo(db.User, { foreignKey: 'adminId', as: 'admin' });
  };

  AdminActivityLog.prototype.toJSON = function toJSON() {
    return {
      id: this.id,
      action: this.action,
      adminUsername: this.adminUsername,
      targetUsername: this.targetUsername,
      metadata: this.metadata,
      createdAt: this.createdAt,
    };
  };

  return AdminActivityLog;
};

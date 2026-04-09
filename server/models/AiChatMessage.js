'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiChatMessage = sequelize.define('AiChatMessage', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'session_id',
    },
    role: {
      type: DataTypes.ENUM('user', 'assistant'),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  }, {
    tableName: 'ai_chat_messages',
    underscored: true,
    timestamps: true,
  });

  AiChatMessage.associate = (models) => {
    AiChatMessage.belongsTo(models.AiChatSession, { foreignKey: 'session_id', as: 'session' });
  };

  return AiChatMessage;
};

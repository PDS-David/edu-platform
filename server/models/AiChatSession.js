const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiChatSession = sequelize.define('AiChatSession', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
    title: { type: DataTypes.STRING },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    metadata: { type: DataTypes.JSONB },
  }, {
    tableName: 'ai_chat_sessions',
    underscored: true,
    timestamps: true,
  });

  AiChatSession.associate = (models) => {
    AiChatSession.belongsTo(models.User, { foreignKey: 'student_id', as: 'student' });
    AiChatSession.hasMany(models.AiChatMessage, { foreignKey: 'session_id' });
  };

  return AiChatSession;
};

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Quiz = sequelize.define('Quiz', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    topicId: { type: DataTypes.INTEGER, field: 'topic_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    timeLimitMinutes: { type: DataTypes.INTEGER, field: 'time_limit_minutes' },
    passingScore: { type: DataTypes.INTEGER, defaultValue: 70, field: 'passing_score' },
    isPremium: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_premium' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    createdBy: { type: DataTypes.UUID, field: 'created_by' },
  }, {
    tableName: 'quizzes',
    underscored: true,
    timestamps: true,
  });

  Quiz.associate = (models) => {
    Quiz.belongsTo(models.Topic, { foreignKey: 'topic_id' });
    Quiz.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Quiz.hasMany(models.Question, { foreignKey: 'quiz_id' });
  };

  return Quiz;
};

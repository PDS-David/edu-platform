const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PracticeAttempt = sequelize.define('PracticeAttempt', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' },
    questionId: { type: DataTypes.INTEGER, allowNull: false, field: 'question_id' },
    attemptedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'attempted_at' },
    isCorrect: { type: DataTypes.BOOLEAN, field: 'is_correct' },
    answerGiven: { type: DataTypes.TEXT, field: 'answer_given' },
    timeTakenSeconds: { type: DataTypes.INTEGER, field: 'time_taken_seconds' },
  }, {
    tableName: 'practice_attempts',
    underscored: true,
    timestamps: true,
  });

  PracticeAttempt.associate = (models) => {
    PracticeAttempt.belongsTo(models.User, { foreignKey: 'student_id', as: 'student' });
    PracticeAttempt.belongsTo(models.Question, { foreignKey: 'question_id' });
  };

  return PracticeAttempt;
};

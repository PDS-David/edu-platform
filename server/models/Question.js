const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Question = sequelize.define('Question', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subtopicId: { type: DataTypes.INTEGER, field: 'subtopic_id' }, // handoff: questions.subtopic_id
    submittedBy: { type: DataTypes.UUID, field: 'submitted_by' }, // handoff: questions.submitted_by
    questionText: { type: DataTypes.TEXT, allowNull: false, field: 'question_text' },
    type: { type: DataTypes.ENUM('mcq', 'true_false', 'short_answer', 'essay'), defaultValue: 'mcq' },
    options: { type: DataTypes.JSONB },
    correctAnswer: { type: DataTypes.TEXT, field: 'correct_answer' },
    explanation: { type: DataTypes.TEXT },
    marks: { type: DataTypes.INTEGER, defaultValue: 1 },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    imageUrl: { type: DataTypes.STRING, field: 'image_url' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, {
    tableName: 'questions',
    underscored: true,
    timestamps: true,
  });

  Question.associate = (models) => {
    Question.belongsTo(models.Subtopic, { foreignKey: 'subtopic_id' });
    Question.belongsTo(models.User, { foreignKey: 'submitted_by', as: 'submitter' });
  };

  return Question;
};

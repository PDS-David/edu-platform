const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Question = sequelize.define('Question', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subtopicId: { type: DataTypes.INTEGER, field: 'subtopic_id' }, // handoff: questions.subtopic_id
    submittedBy: { type: DataTypes.UUID, field: 'submitted_by' }, // handoff: questions.submitted_by
    questionText: { type: DataTypes.TEXT, allowNull: false, field: 'question_text' },
    // Phase 5: 'structured' added — theory/free-response questions, rendered
    // like essay questions but NOT routed through AI marking (see
    // questionsRoutes.js POST /:id/answer). Must match
    // database/migration_009_structured_question_type.sql.
    type: { type: DataTypes.ENUM('mcq', 'true_false', 'short_answer', 'essay', 'structured'), defaultValue: 'mcq' },
    options: { type: DataTypes.JSONB },
    correctAnswer: { type: DataTypes.TEXT, field: 'correct_answer' },
    explanation: { type: DataTypes.TEXT },
    marks: { type: DataTypes.INTEGER, defaultValue: 1 },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    imageUrl: { type: DataTypes.STRING, field: 'image_url' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    difficulty: { type: DataTypes.ENUM('easy', 'medium', 'hard'), defaultValue: 'medium' },
    status: { type: DataTypes.STRING, defaultValue: 'approved' },
    source: { type: DataTypes.STRING },
    isAiGenerated: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_ai_generated' },
    aiGenerationSource: { type: DataTypes.STRING, field: 'ai_generation_source' },
    topic: { type: DataTypes.STRING },
    year: { type: DataTypes.INTEGER },
    conceptHint: { type: DataTypes.TEXT, field: 'concept_hint' },
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

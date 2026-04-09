const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SubtopicProgress = sequelize.define('SubtopicProgress', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
    subtopicId: { type: DataTypes.INTEGER, allowNull: false, field: 'subtopic_id' },
    resourcesCompleted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'resources_completed' },
    practiceCompleted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'practice_completed' },
    quizCompleted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'quiz_completed' },
    updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
  }, {
    tableName: 'subtopic_progress',
    underscored: true,
    timestamps: true,
  });

  SubtopicProgress.associate = (models) => {
    SubtopicProgress.belongsTo(models.User, { foreignKey: 'student_id', as: 'student' });
    SubtopicProgress.belongsTo(models.Subtopic, { foreignKey: 'subtopic_id' });
  };

  return SubtopicProgress;
};

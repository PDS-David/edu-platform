const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StudentExamType = sequelize.define('StudentExamType', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
    examBoardId: { type: DataTypes.INTEGER, allowNull: false, field: 'exam_board_id' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, {
    tableName: 'student_exam_types',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['student_id', 'exam_board_id'], // UNIQUE(student_id, exam_board_id) per handoff
      },
    ],
  });

  StudentExamType.associate = (models) => {
    StudentExamType.belongsTo(models.User, { foreignKey: 'student_id', as: 'student' });
    StudentExamType.belongsTo(models.ExamBoard, { foreignKey: 'exam_board_id' });
  };

  return StudentExamType;
};

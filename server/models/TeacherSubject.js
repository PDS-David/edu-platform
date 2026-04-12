'use strict';
const { DataTypes } = require('sequelize');
module.exports = (sequelize) => {
  const TeacherSubject = sequelize.define('TeacherSubject', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    teacherId: {
      type: DataTypes.UUID,       //  matches users.id (uuid)
      allowNull: false,
      field: 'teacher_id',
    },
    subjectId: {
      type: DataTypes.INTEGER,    //  matches subjects.id (integer)
      allowNull: false,
      field: 'subject_id',
    },
    examBoardId: {
      type: DataTypes.INTEGER,    //  matches exam_boards.id (integer)
      allowNull: true,
      field: 'exam_board_id',
    },
    assignedBy: {
      type: DataTypes.UUID,       //  matches users.id (uuid)
      allowNull: true,
      field: 'assigned_by',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    assignedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at',
    },
  }, {
    tableName: 'teacher_subjects',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['teacher_id', 'subject_id'] },
    ],
  });

  TeacherSubject.associate = (models) => {
    TeacherSubject.belongsTo(models.User,      { foreignKey: 'teacher_id', as: 'teacher' });
    TeacherSubject.belongsTo(models.Subject,   { foreignKey: 'subject_id' });
    TeacherSubject.belongsTo(models.ExamBoard, { foreignKey: 'exam_board_id' });
  };

  return TeacherSubject;
};

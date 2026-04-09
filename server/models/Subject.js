const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subject = sequelize.define('Subject', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    examBoardId: { type: DataTypes.INTEGER, allowNull: false, field: 'exam_board_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING },
    level: { type: DataTypes.STRING }, // e.g. GCSE, A-Level
    description: { type: DataTypes.TEXT },
    imageUrl: { type: DataTypes.STRING, field: 'image_url' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, {
    tableName: 'subjects',
    underscored: true,
    timestamps: true,
  });

  Subject.associate = (models) => {
    Subject.belongsTo(models.ExamBoard, { foreignKey: 'exam_board_id' });
    Subject.hasMany(models.Topic, { foreignKey: 'subject_id' });
    Subject.hasMany(models.Course, { foreignKey: 'subject_id' });
    Subject.hasMany(models.PastPaper, { foreignKey: 'subject_id' });
  };

  return Subject;
};

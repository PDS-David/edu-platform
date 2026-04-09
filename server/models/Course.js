const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Course = sequelize.define('Course', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subjectId: { type: DataTypes.INTEGER, field: 'subject_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    price: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    currency: { type: DataTypes.STRING(10), defaultValue: 'GBP' },
    isFree: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_free' },
    isPremium: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_premium' },
    thumbnailUrl: { type: DataTypes.STRING, field: 'thumbnail_url' },
    level: { type: DataTypes.STRING },
    durationHours: { type: DataTypes.DECIMAL(5, 1), field: 'duration_hours' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    createdBy: { type: DataTypes.INTEGER, field: 'created_by' },
  }, {
    tableName: 'courses',
    underscored: true,
    timestamps: true,
  });

  Course.associate = (models) => {
    Course.belongsTo(models.Subject, { foreignKey: 'subject_id' });
    Course.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Course.hasMany(models.Enrollment, { foreignKey: 'course_id' });
    Course.hasMany(models.Video, { foreignKey: 'course_id' });
  };

  return Course;
};

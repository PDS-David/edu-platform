const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Enrollment = sequelize.define('Enrollment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' }, // handoff uses student_id not user_id
    courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
    status: { type: DataTypes.ENUM('active', 'completed', 'cancelled', 'pending'), defaultValue: 'active' },
    enrollmentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'enrollment_date' }, // handoff column name
    completedAt: { type: DataTypes.DATE, field: 'completed_at' },
    progressPercentage: { type: DataTypes.INTEGER, defaultValue: 0, field: 'progress_percentage' }, // handoff column name
    paymentId: { type: DataTypes.INTEGER, field: 'payment_id' },
  }, {
    tableName: 'enrollments',
    underscored: true,
    timestamps: true,
  });

  Enrollment.associate = (models) => {
    Enrollment.belongsTo(models.User, { foreignKey: 'student_id', as: 'student' });
    Enrollment.belongsTo(models.Course, { foreignKey: 'course_id' });
  };

  return Enrollment;
};

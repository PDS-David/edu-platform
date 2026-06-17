// server/models/Enrollment.js
// Enrollment model with full lifecycle status support.
//
// Status lifecycle:
//   pending    → payment initiated, access withheld
//   active     → full access granted
//   expired    → access period ended
//   cancelled  → revoked by student or admin
//   suspended  → frozen by admin (policy violation, dispute)
//
// The old 'completed' value is mapped to 'expired' at read-time for
// backward compatibility with any rows written before this migration.

'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Enrollment = sequelize.define('Enrollment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    studentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'student_id',
    },
    // Legacy column — some rows may have user_id instead of student_id.
    // Both are accepted by queries; student_id is canonical.
    userId: {
      type: DataTypes.UUID,
      field: 'user_id',
      allowNull: true,
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'course_id',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        isIn: {
          args: [['pending', 'active', 'expired', 'cancelled', 'suspended']],
          msg: 'Invalid enrollment status',
        },
      },
    },
    enrollmentDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'enrollment_date',
    },
    expiresAt: {
      type: DataTypes.DATE,
      field: 'expires_at',
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at',
      allowNull: true,
    },
    progressPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'progress_percentage',
    },
    paymentId: {
      type: DataTypes.INTEGER,
      field: 'payment_id',
      allowNull: true,
    },
    suspendedAt: {
      type: DataTypes.DATE,
      field: 'suspended_at',
      allowNull: true,
    },
    suspendedReason: {
      type: DataTypes.TEXT,
      field: 'suspended_reason',
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      field: 'cancelled_at',
      allowNull: true,
    },
  }, {
    tableName: 'enrollments',
    underscored: true,
    timestamps: true,
  });

  Enrollment.associate = (models) => {
    Enrollment.belongsTo(models.User, { foreignKey: 'student_id', as: 'student' });
    Enrollment.belongsTo(models.Course, { foreignKey: 'course_id' });
  };

  // Instance helper: is this enrollment currently granting access?
  Enrollment.prototype.isActive = function () {
    if (this.status !== 'active') return false;
    if (this.expiresAt && new Date(this.expiresAt) <= new Date()) return false;
    return true;
  };

  return Enrollment;
};

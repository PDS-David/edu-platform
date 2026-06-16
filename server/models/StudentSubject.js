const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StudentSubject = sequelize.define(
    'StudentSubject',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      studentId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'student_id',
      },

      subjectId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'subject_id',
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },

      addedAt: {
        type: DataTypes.DATE,
        field: 'added_at',
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'approved',
      },

      enrollmentSource: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'explicit',
        field: 'enrollment_source',
      },
    },
    {
      tableName: 'student_subjects',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['student_id', 'subject_id'],
        },
      ],
    }
  );

  StudentSubject.associate = (models) => {
    if (models.User) {
      StudentSubject.belongsTo(models.User, {
        foreignKey: 'student_id',
        as: 'student',
      });
    }

    if (models.Subject) {
      StudentSubject.belongsTo(models.Subject, {
        foreignKey: 'subject_id',
      });
    }
  };

  return StudentSubject;
};

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StudentExamType = sequelize.define(
    'StudentExamType',
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

      examBoardId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'exam_board_id',
      },
      subscriptionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'subscription_id',
      },

      grantedAt: {
        type: DataTypes.DATE,
        field: 'granted_at',
      },

      expiresAt: {
        type: DataTypes.DATE,
        field: 'expires_at',
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'approved',
      },
    },
    {
      tableName: 'student_exam_types',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['student_id', 'exam_board_id'],
        },
      ],
    }
  );

  StudentExamType.associate = (models) => {
    if (models.User) {
      StudentExamType.belongsTo(models.User, {
        foreignKey: 'student_id',
        as: 'student',
      });
    }

    if (models.ExamBoard) {
      StudentExamType.belongsTo(models.ExamBoard, {
        foreignKey: 'exam_board_id',
      });
    }
  };

  return StudentExamType;
};

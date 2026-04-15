'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SubtopicProgress = sequelize.define(
    'SubtopicProgress',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      subtopic_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      resources_completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      practice_completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      quiz_completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: 'subtopic_progress',
      timestamps: true,
      underscored: true,

      indexes: [
        {
          unique: true,
          fields: ['student_id', 'subtopic_id'],
        },
        {
          fields: ['student_id'],
        },
        {
          fields: ['subtopic_id'],
        },
      ],
    }
  );

  return SubtopicProgress;
};

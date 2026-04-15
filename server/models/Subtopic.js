'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Subtopic',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      topic_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      subject_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      order_index: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      tableName: 'subtopics',
      timestamps: true,
      underscored: true,
    }
  );
};

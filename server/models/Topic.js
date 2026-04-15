'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Topic',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      tableName: 'topics',
      timestamps: true,
      underscored: true,
    }
  );
};

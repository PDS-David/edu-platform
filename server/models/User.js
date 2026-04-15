'use strict';

const { DataTypes, Model, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

class User extends Model {
  async comparePassword(plainText) {
    return bcrypt.compare(plainText, this.password);
  }

  toSafeJSON() {
    const obj = this.toJSON();
    delete obj.password;
    return obj;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },

    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    first_name: DataTypes.STRING(100),
    last_name: DataTypes.STRING(100),
    avatar_url: DataTypes.TEXT,
    phone: DataTypes.STRING(30),
    country: DataTypes.STRING(100),

    role: {
      type: DataTypes.ENUM('student', 'teacher', 'admin'),
      allowNull: false,
      defaultValue: 'student',
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    subscription_status: {
      type: DataTypes.ENUM('free', 'free_trial', 'active', 'expired', 'cancelled'),
      defaultValue: 'free',
    },

    subscription_expires_at: DataTypes.DATE,

    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    verification_token: DataTypes.STRING(255),
    verification_token_expires: DataTypes.DATE,

    reset_password_token: DataTypes.STRING(255),
    reset_password_expires: DataTypes.DATE,

    onboarding_complete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    daily_goal: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
    },

    preferred_study_days: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },

    preferred_study_time: {
      type: DataTypes.STRING(20),
      defaultValue: 'evening',
    },

    xp_points: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    study_streak_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    last_login: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    underscored: true,

    indexes: [
      { unique: true, fields: ['email'] },
      { fields: ['role'] },
      { fields: ['is_active'] },
      { fields: ['subscription_status'] },

      {
        fields: ['reset_password_token'],
        where: { reset_password_token: { [Op.ne]: null } },
      },
      {
        fields: ['verification_token'],
        where: { verification_token: { [Op.ne]: null } },
      },
    ],

    hooks: {
      beforeSave: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },

    defaultScope: {
      attributes: { exclude: ['password'] },
    },

    scopes: {
      withPassword: {
        attributes: { include: ['password'] },
      },
    },
  }
);

module.exports = User;

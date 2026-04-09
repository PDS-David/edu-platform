'use strict';

// models/User.js
//
// Defines every column that is referenced across:
//   middleware/auth.js, routes/users.js, routes/authRoutes.js,
//   controllers/auth.js (inferred), services/userMemory.js
//
// This model exists primarily so sequelize.sync({ alter: true }) creates/
// maintains the users table correctly. All queries in the routes use raw SQL
// (QueryTypes.SELECT etc.) rather than Sequelize model methods — that is fine
// and intentional; the model is the schema source of truth.

const { DataTypes, Model } = require('sequelize');
const bcrypt               = require('bcryptjs');
const sequelize            = require('../config/database');

class User extends Model {
  // ── Instance helpers ──────────────────────────────────────────────────────

  /** Compare a plain-text password against the stored hash. */
  async comparePassword(plainText) {
    return bcrypt.compare(plainText, this.password);
  }

  /** Return a safe subset of the user — never expose the password hash. */
  toSafeJSON() {
    const obj = this.toJSON();
    delete obj.password;
    return obj;
  }
}

User.init(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    email: {
      type:      DataTypes.STRING(255),
      allowNull: false,
      unique:    true,
      validate:  { isEmail: true },
    },
    password: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },

    // ── Profile ───────────────────────────────────────────────────────────────
    first_name: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    last_name: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    avatar_url: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    phone: {
      type:      DataTypes.STRING(30),
      allowNull: true,
    },
    country: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },

    // ── Role & status ─────────────────────────────────────────────────────────
    role: {
      type:         DataTypes.ENUM('student', 'teacher', 'admin'),
      allowNull:    false,
      defaultValue: 'student',
    },
    is_active: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },

    // ── Subscription ──────────────────────────────────────────────────────────
    // subscription_status used in: protect middleware, loginWithSubscription,
    // users/stats query, users/:id query
    subscription_status: {
      type:         DataTypes.ENUM('free', 'active', 'expired', 'cancelled'),
      allowNull:    false,
      defaultValue: 'free',
    },
    subscription_expires_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },

    // ── Email verification ────────────────────────────────────────────────────
    is_verified: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    verification_token: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    verification_token_expires: {
      type:      DataTypes.DATE,
      allowNull: true,
    },

    // ── Password reset ────────────────────────────────────────────────────────
    reset_password_token: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    reset_password_expires: {
      type:      DataTypes.DATE,
      allowNull: true,
    },

    // ── Onboarding & preferences ──────────────────────────────────────────────
    // onboarding_complete used in: PATCH /users/preferences, GET /users/:id
    onboarding_complete: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    // daily_goal used in: PATCH /users/preferences
    daily_goal: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 50,
    },
    // preferred_study_days used in: PATCH /users/preferences
    // Stored as a JSON array of strings e.g. ['Mon', 'Wed', 'Fri']
    preferred_study_days: {
      type:         DataTypes.JSONB,
      allowNull:    true,
      defaultValue: [],
    },
    // preferred_study_time used in: PATCH /users/preferences
    preferred_study_time: {
      type:         DataTypes.STRING(20),
      allowNull:    true,
      defaultValue: 'evening',
    },

    // ── Gamification ─────────────────────────────────────────────────────────
    // xp_points used in: GET /users/:id
    xp_points: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    // study_streak_days used in: GET /users/:id
    study_streak_days: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },

    // ── Activity tracking ─────────────────────────────────────────────────────
    // last_login used in: GET /users (list), GET /users/:id
    last_login: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName:  'User',
    tableName:  'users',
    timestamps: true,           // Sequelize manages created_at / updated_at
    underscored: true,          // maps createdAt → created_at, etc.

    // ── Indexes ───────────────────────────────────────────────────────────────
    indexes: [
      { unique: true, fields: ['email'] },
      { fields: ['role'] },
      { fields: ['is_active'] },
      { fields: ['subscription_status'] },
      { fields: ['reset_password_token'],  where: { reset_password_token:  { [require('sequelize').Op.ne]: null } } },
      { fields: ['verification_token'],    where: { verification_token:    { [require('sequelize').Op.ne]: null } } },
    ],

    // ── Hooks ─────────────────────────────────────────────────────────────────
    hooks: {
      // Hash password before every create and update that changes it
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },

    // ── Default scope — never return password in queries ──────────────────────
    defaultScope: {
      attributes: { exclude: ['password'] },
    },
    scopes: {
      // Use User.scope('withPassword').findOne(...) when you need to verify login
      withPassword: {
        attributes: { include: ['password'] },
      },
    },
  }
);

module.exports = User;

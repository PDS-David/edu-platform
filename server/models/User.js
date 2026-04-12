'use strict';

// models/User.js
//
// Defines every column that is referenced across:
//   middleware/auth.js, routes/users.js, routes/authRoutes.js,
//   controllers/auth.js (inferred), services/userMemory.js
//
// This model exists primarily so sequelize.sync({ alter: true }) creates/
// maintains the users table correctly. All queries in the routes use raw SQL
// (QueryTypes.SELECT etc.) rather than Sequelize model methods â€” that is fine
// and intentional; the model is the schema source of truth.

const { DataTypes, Model } = require('sequelize');
const bcrypt               = require('bcryptjs');
const sequelize            = require('../config/database');

class User extends Model {
  // â”€â”€ Instance helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Compare a plain-text password against the stored hash. */
  async comparePassword(plainText) {
    return bcrypt.compare(plainText, this.password);
  }

  /** Return a safe subset of the user â€” never expose the password hash. */
  toSafeJSON() {
    const obj = this.toJSON();
    delete obj.password;
    return obj;
  }
}

User.init(
  {
    // â”€â”€ Identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Role & status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // subscription_status used in: protect middleware, loginWithSubscription,
    // users/stats query, users/:id query
    subscription_status: {
      type:         DataTypes.ENUM('free', 'free_trial', 'active', 'expired', 'cancelled'),
      allowNull:    false,
      defaultValue: 'free',
    },
    subscription_expires_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },

    // â”€â”€ Email verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Password reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    reset_password_token: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    reset_password_expires: {
      type:      DataTypes.DATE,
      allowNull: true,
    },

    // â”€â”€ Onboarding & preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Gamification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Activity tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    underscored: true,          // maps createdAt â†’ created_at, etc.

    // â”€â”€ Indexes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    indexes: [
      { unique: true, fields: ['email'] },
      { fields: ['role'] },
      { fields: ['is_active'] },
      { fields: ['subscription_status'] },
      { fields: ['reset_password_token'],  where: { reset_password_token:  { [require('sequelize').Op.ne]: null } } },
      { fields: ['verification_token'],    where: { verification_token:    { [require('sequelize').Op.ne]: null } } },
    ],

    // â”€â”€ Hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Default scope â€” never return password in queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

'use strict';

const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
const { QueryTypes } = require('sequelize');
const db         = require('../config/database');
const { generateToken } = require('../utils/jwt');

let sendPasswordResetEmail = () => Promise.resolve();
let sendVerificationEmail  = () => Promise.resolve();
try {
  const emailService        = require('../services/emailService');
  sendPasswordResetEmail    = emailService.sendPasswordResetEmail  || sendPasswordResetEmail;
  sendVerificationEmail     = emailService.sendVerificationEmail   || sendVerificationEmail;
} catch {}

function safeUser(row) {
  const {
    password,
    reset_password_token, reset_password_expires,
    verification_token,   verification_token_expires,
    ...safe
  } = row;
  return safe;
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { email, password, role = 'student' } = req.body;

    const first_name = (req.body.first_name || req.body.firstName || '').trim();
    const last_name  = (req.body.last_name  || req.body.lastName  || first_name).trim();

    const pendingExamBoards = req.body.pendingExamBoards || [];

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const allowedRoles = ['student', 'teacher'];
    const assignedRole = allowedRoles.includes(role) ? role : 'student';

    const existing = await db.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const verificationToken = randomToken();
    const verificationTokenExpires = new Date(Date.now() + 86400000);

    const pendingIds = Array.isArray(pendingExamBoards) ? pendingExamBoards : [];

    const rows = await db.query(
      `INSERT INTO users
       (email, password, first_name, last_name, role,
        verification_token, verification_token_expires,
        is_active, is_verified, subscription_status,
        subscription_expires_at,
        pending_exam_board_ids,
        created_at, updated_at)
       VALUES
       (:email, :password, :first_name, :last_name, :role,
        :verificationToken, :verificationTokenExpires,
        true, false, 'free_trial',
        NOW() + INTERVAL '14 days',
        :pendingIds::uuid[],
        NOW(), NOW())
       RETURNING
         id, email, first_name, last_name, role,
         is_active, is_verified, subscription_status,
         onboarding_complete, xp_points, study_streak_days,
         pending_exam_board_ids,
         created_at`,
      {
        replacements: {
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          first_name,
          last_name,
          role: assignedRole,
          verificationToken,
          verificationTokenExpires,
          pendingIds: pendingIds.length ? `{${pendingIds.join(',')}}` : '{}'
        },
        type: QueryTypes.SELECT
      }
    );

    const user = safeUser(rows[0]);
    const token = generateToken({ id: user.id, role: user.role });

    return res.status(201).json({
      success: true,
      token,
      user
    });

  } catch (err) {
    console.error('[register]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const rows = await db.query(
      `SELECT
         id, email, password, first_name, last_name, role,
         is_active, is_verified, subscription_status,
         subscription_expires_at, onboarding_complete,
         xp_points, study_streak_days, last_login,
         avatar_url, daily_goal
       FROM users
       WHERE email = :email
       LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const userRow = rows[0];

    if (!userRow.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    const match = await bcrypt.compare(password, userRow.password);

    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    setImmediate(() =>
      db.query(
        `UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = :id`,
        { replacements: { id: userRow.id }, type: QueryTypes.UPDATE }
      ).catch(() => {})
    );

    const token = generateToken({ id: userRow.id, role: userRow.role });

    const user = safeUser(userRow);

    return res.status(200).json({
      success: true,
      token,
      user
    });

  } catch (err) {
    console.error('[login]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET ME
// ─────────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM users WHERE id = :id LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      user: rows[0]
    });

  } catch (err) {
    console.error('[getMe]', err.message);
    next(err);
  }
};

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { generateToken } = require('../utils/jwt');
const { QueryTypes } = require('sequelize');
const db = require('../config/database');

// ─── Email transporter ───────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

// ─── Register ────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role = 'student', terms_accepted = false } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'Please provide all required fields' });
    }

    if (!terms_accepted) {
      return res.status(400).json({ success: false, error: 'You must accept the Terms of Service to register' });
    }

    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      { bind: [email.toLowerCase()], type: QueryTypes.SELECT }
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, error: 'User with this email already exists' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified, terms_accepted_at, terms_version)
       VALUES ($1, $2, $3, $4, $5, true, false, NOW(), '1.0')
       RETURNING id, email, first_name, last_name, role, created_at`,
      { bind: [email.toLowerCase(), passwordHash, firstName, lastName, role], type: QueryTypes.SELECT }
    );

    const user = result[0];
    const token = generateToken(user.id, user.role);

    // ── Activate 14-day free trial ────────────────────────────────────────────
    if (user.role === 'student') {
      try {
        const trialExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        // Set subscription_status to free_trial
        await db.query(
          `UPDATE users
           SET subscription_status = 'free_trial', subscription_expires_at = $1
           WHERE id = $2`,
          { bind: [trialExpiry.toISOString(), user.id], type: QueryTypes.UPDATE }
        );

        // Grant access to JAMB (default board) for the trial period
        // Look up JAMB dynamically so the UUID survives re-seeds
        const jambResult = await db.query(
          `SELECT id FROM exam_boards WHERE UPPER(code) = 'JAMB' LIMIT 1`,
          { type: QueryTypes.SELECT }
        );

        if (jambResult.length > 0) {
          const jambBoardId = jambResult[0].id;
          await db.query(
            `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, expires_at)
             VALUES ($1, $2, true, $3)
             ON CONFLICT (student_id, exam_board_id) DO NOTHING`,
            { bind: [user.id, jambBoardId, trialExpiry.toISOString()], type: QueryTypes.INSERT }
          );
        } else {
          console.warn('[register] Free trial: JAMB exam board not found in exam_boards table — skipping student_exam_types insert');
        }
      } catch (trialErr) {
        console.warn('[register] Free trial activation failed:', trialErr.message);
        // Non-fatal — user is still registered
      }
    }

    // ── Send verification email ───────────────────────────────────────────────
    try {
      const verifyToken     = crypto.randomBytes(32).toString('hex');
      const verifyTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
      const verifyExpiry    = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db.query(
        'UPDATE users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3',
        { bind: [verifyTokenHash, verifyExpiry.toISOString(), user.id], type: QueryTypes.UPDATE }
      );

      const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verifyToken}&id=${user.id}`;
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"EAC Learning Platform" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Verify your EAC Learning Platform email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #3B82F6; font-size: 24px; margin: 0;">EAC Learning Platform</h1>
              <p style="color: #6B7280; font-size: 14px;">Educational Advancement Centre</p>
            </div>
            <div style="background: #F9FAFB; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
              <h2 style="color: #111827; margin-top: 0;">Hello, ${firstName}!</h2>
              <p style="color: #374151; line-height: 1.6;">
                Thank you for registering. Please verify your email address to activate your account.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}"
                   style="background: #3B82F6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Verify My Email
                </a>
              </div>
              <p style="color: #6B7280; font-size: 13px; line-height: 1.6;">
                This link will expire in <strong>24 hours</strong>. If you did not create this account, please ignore this email.
              </p>
              <p style="color: #9CA3AF; font-size: 12px; word-break: break-all;">
                If the button does not work, copy this link: ${verifyUrl}
              </p>
            </div>
            <div style="text-align: center; color: #9CA3AF; font-size: 12px; border-top: 1px solid #E5E7EB; padding-top: 20px;">
              <p>© 2026 EAC Learning Platform · info@eac.edu.ng</p>
            </div>
          </div>
        `
      });
    } catch (emailErr) {
      console.warn('[register] Verification email failed:', emailErr.message);
      // Non-fatal — user is still registered
    }

    res.status(201).json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password, remember_me = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email and password' });
    }

    const result = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active, avatar_url
       FROM users WHERE email = $1`,
      { bind: [email.toLowerCase()], type: QueryTypes.SELECT }
    );

    if (result.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result[0];

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'Account has been deactivated' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      { bind: [user.id], type: QueryTypes.UPDATE }
    );

    const expiry = remember_me ? '30d' : (process.env.JWT_EXPIRE || '7d');
    const token = generateToken(user.id, user.role, expiry);

    res.status(200).json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, avatarUrl: user.avatar_url },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
};

// ─── Get Me ──────────────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, first_name, last_name, role, avatar_url, phone, country,
              created_at, last_login,
              COALESCE(subscription_status, 'free')  AS subscription_status,
              COALESCE(onboarding_complete, false)    AS onboarding_complete,
              COALESCE(xp_points, 0)                 AS xp_points,
              COALESCE(study_streak_days, 0)          AS study_streak_days,
              COALESCE(daily_goal, 20)                AS daily_goal
       FROM users WHERE id = $1`,
      { bind: [req.user.id], type: QueryTypes.SELECT }
    );

    const user = result[0];
    res.status(200).json({
      success: true,
      data: {
        id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
        role: user.role, avatarUrl: user.avatar_url, phone: user.phone,
        country: user.country, createdAt: user.created_at, lastLogin: user.last_login,
        subscriptionStatus: user.subscription_status,
        onboardingComplete: user.onboarding_complete,
        xpPoints:           user.xp_points,
        studyStreakDays:     user.study_streak_days,
        dailyGoal:          user.daily_goal,
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, error: 'Server error fetching user data' });
  }
};

// ─── Update Password ─────────────────────────────────────────────────────────
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please provide current and new password' });
    }

    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      { bind: [req.user.id], type: QueryTypes.SELECT }
    );

    const user = result[0];
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      { bind: [newPasswordHash, req.user.id], type: QueryTypes.UPDATE }
    );

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ success: false, error: 'Server error updating password' });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Please provide your email address' });
    }

    // Always return success to prevent email enumeration attacks
    const result = await db.query(
      'SELECT id, first_name, email FROM users WHERE email = $1 AND is_active = true',
      { bind: [email.toLowerCase()], type: QueryTypes.SELECT }
    );

    if (result.length === 0) {
      // Return success even if email not found (security best practice)
      return res.status(200).json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const user = result[0];

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store hashed token in DB (requires password_reset_token and password_reset_expires columns)
    await db.query(
      `UPDATE users 
       SET password_reset_token = $1, password_reset_expires = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      { bind: [resetTokenHash, resetExpiry.toISOString(), user.id], type: QueryTypes.UPDATE }
    );

    // Build reset URL (uses raw token, not hash)
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}&id=${user.id}`;

    // Send email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"EAC Learning Platform" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Password Reset Request – EAC Learning Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #3B82F6; font-size: 24px; margin: 0;">EAC Learning Platform</h1>
            <p style="color: #6B7280; font-size: 14px;">Educational Advancement Centre</p>
          </div>
          
          <div style="background: #F9FAFB; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #111827; margin-top: 0;">Hello, ${user.first_name}</h2>
            <p style="color: #374151; line-height: 1.6;">
              We received a request to reset the password for your EAC Learning Platform account.
              Click the button below to set a new password.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #3B82F6; color: white; padding: 14px 32px; border-radius: 8px; 
                        text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                Reset My Password
              </a>
            </div>
            
            <p style="color: #6B7280; font-size: 13px; line-height: 1.6;">
              This link will expire in <strong>1 hour</strong>. If you did not request a password reset, 
              please ignore this email — your account remains secure.
            </p>
            
            <p style="color: #9CA3AF; font-size: 12px; word-break: break-all;">
              If the button doesn't work, copy this link: ${resetUrl}
            </p>
          </div>
          
          <div style="text-align: center; color: #9CA3AF; font-size: 12px; border-top: 1px solid #E5E7EB; padding-top: 20px;">
            <p>© 2026 EAC Learning Platform · info@eac.edu.ng</p>
            <p>+234 809 012 3412 · +234 809 912 3412 · +234 803 123 1234</p>
          </div>
        </div>
      `
    });

    res.status(200).json({ success: true, message: 'If that email is registered, a reset link has been sent.' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Server error. Please try again or contact info@eac.edu.ng' });
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, userId, newPassword } = req.body;

    if (!token || !userId || !newPassword) {
      return res.status(400).json({ success: false, error: 'Invalid or missing reset details' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    // Hash the incoming token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await db.query(
      `SELECT id, email FROM users 
       WHERE id = $1 AND password_reset_token = $2 AND password_reset_expires > NOW() AND is_active = true`,
      { bind: [userId, tokenHash], type: QueryTypes.SELECT }
    );

    if (result.length === 0) {
      return res.status(400).json({ success: false, error: 'Reset link is invalid or has expired. Please request a new one.' });
    }

    const user = result[0];

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await db.query(
      `UPDATE users 
       SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      { bind: [newPasswordHash, user.id], type: QueryTypes.UPDATE }
    );

    res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Server error resetting password' });
  }
};

// ─── Verify Email ────────────────────────────────────────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({ success: false, error: 'Missing token or userId' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await db.query(
      'SELECT id FROM users WHERE id = $1 AND email_verify_token = $2 AND email_verify_expires > NOW()',
      { bind: [userId, tokenHash], type: QueryTypes.SELECT }
    );

    if (!result.length) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification link. Please register again.' });
    }

    await db.query(
      'UPDATE users SET email_verified = true, email_verify_token = NULL, email_verify_expires = NULL WHERE id = $1',
      { bind: [userId], type: QueryTypes.UPDATE }
    );

    res.status(200).json({ success: true, message: 'Email verified successfully.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, error: 'Server error during email verification' });
  }
};

module.exports = { register, login, getMe, updatePassword, forgotPassword, resetPassword, verifyEmail };

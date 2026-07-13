// server/services/emailService.js
//
// Nodemailer-based email service.
//
// Required in server/.env:
//   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
//
// How to get your Gmail app password:
//   1. Google Account > Security > 2-Step Verification (enable first)
//   2. Google Account > Security > App passwords
//   3. Select "Mail", click Generate
//   4. Copy the 16-character password (no spaces) into EMAIL_PASS
//
// The old SMTP_* variable set has been removed to avoid confusion.
// Only EMAIL_* variables are used.

const nodemailer = require('nodemailer');

// Lazy-initialised so a missing EMAIL_USER does not crash the server on startup
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const port = parseInt(process.env.EMAIL_PORT) || 587;

  if (!host || !user) {
    console.warn('[emailService] EMAIL_HOST / EMAIL_USER not set — emails are disabled');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user, pass },
  });

  return _transporter;
}

const FROM    = process.env.EMAIL_FROM || 'AISchoolonair <noreply@AISchoolonair.com>';
const APP_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function send(to, subject, html) {
  const t = getTransporter();
  if (!t) return; // silently skip when email is not configured
  try {
    await t.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[emailService] Failed to send to ${to}:`, err.message);
  }
}

async function sendWelcomeEmail(user) {
  const name = user.first_name || user.firstName || 'Student';
  await send(user.email, 'Welcome to AISchoolonair! ', `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:24px;margin-bottom:8px">Welcome to AISchoolonair, ${name}! </h1>
      <p style="color:#555;line-height:1.6">
        You now have access to <strong>5 free practice questions per day</strong> across
        JAMB, WAEC and NECO subjects. Each question comes with instant AI feedback so
        you know exactly what the examiner expects.
      </p>
      <a href="${APP_URL}/student/dashboard"
         style="display:inline-block;margin-top:20px;background:#14b8a6;color:#fff;
                text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Start Practising →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        AISchoolonair · Nigeria's AI-powered exam prep platform<br>
        <a href="${APP_URL}/pricing" style="color:#14b8a6">Upgrade to unlimited access</a>
      </p>
    </div>
  `);
}

async function sendWeeklyDigest(user, stats) {
  const name = user.first_name || 'Student';
  const {
    best_subject  = 'Not yet determined',
    weakest_topic = 'Not yet determined',
    streak        = 0,
    accuracy_pct  = 0,
    weakest_subtopic_id,
  } = stats;

  const practiceLink = weakest_subtopic_id
    ? `${APP_URL}/student/subtopic/${weakest_subtopic_id}?tab=practice`
    : `${APP_URL}/student/dashboard`;

  await send(user.email, `${name}, here's your AISchoolonair week in review `, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:20px;margin-bottom:4px">Your week in review, ${name}</h1>
      <p style="color:#888;font-size:13px;margin-bottom:20px">Here's how you did this week</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:#f0fdf4;border-radius:12px;padding:14px">
          <p style="color:#888;font-size:11px;margin:0 0 4px">Best subject</p>
          <p style="color:#065f46;font-weight:700;font-size:16px;margin:0">${best_subject}</p>
        </div>
        <div style="background:#fef3c7;border-radius:12px;padding:14px">
          <p style="color:#888;font-size:11px;margin:0 0 4px">Accuracy</p>
          <p style="color:#92400e;font-weight:700;font-size:16px;margin:0">${accuracy_pct}%</p>
        </div>
        <div style="background:#fdf2f8;border-radius:12px;padding:14px">
          <p style="color:#888;font-size:11px;margin:0 0 4px">Study streak</p>
          <p style="color:#701a75;font-weight:700;font-size:16px;margin:0">${streak} days </p>
        </div>
        <div style="background:#fef2f2;border-radius:12px;padding:14px">
          <p style="color:#888;font-size:11px;margin:0 0 4px">Needs work</p>
          <p style="color:#991b1b;font-weight:700;font-size:14px;margin:0">${weakest_topic}</p>
        </div>
      </div>
      <a href="${practiceLink}"
         style="display:inline-block;background:#0a4a3f;color:#fff;text-decoration:none;
                font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Practice ${weakest_topic} now →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        AISchoolonair · <a href="${APP_URL}/student/dashboard" style="color:#14b8a6">Open dashboard</a>
      </p>
    </div>
  `);
}

async function sendStreakNudge(user, daysSince) {
  const name = user.first_name || 'Student';
  await send(user.email, `${name}, your study streak is at risk! `, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;text-align:center">
      <div style="font-size:48px;margin-bottom:12px"></div>
      <h1 style="color:#0a4a3f;font-size:20px">Don't break your streak, ${name}!</h1>
      <p style="color:#555;line-height:1.6">
        You haven't practised in <strong>${daysSince} days</strong>.
        Just 5 questions today is enough to keep your streak alive.
      </p>
      <a href="${APP_URL}/student/dashboard"
         style="display:inline-block;margin-top:20px;background:#f59e0b;color:#111;
                text-decoration:none;font-weight:700;padding:12px 28px;border-radius:12px;font-size:14px">
        Resume Studying →
      </a>
    </div>
  `);
}

async function sendPaymentConfirmation(user, plan, endDate) {
  const name     = user.first_name || 'Student';
  const planName = plan === 'annual' ? '12-Month Plan' : '1-Month Plan';
  const expiry   = endDate instanceof Date
    ? endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : String(endDate);

  await send(user.email, `Payment confirmed — ${planName} activated `, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:20px;margin-bottom:4px">Payment confirmed, ${name}! </h1>
      <p style="color:#555;line-height:1.6">
        Your <strong>${planName}</strong> is now active. You have unlimited access to all
        practice questions, AI explanations, and quiz features until <strong>${expiry}</strong>.
      </p>
      <a href="${APP_URL}/student/dashboard"
         style="display:inline-block;margin-top:20px;background:#14b8a6;color:#fff;
                text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Start Studying →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        If you have questions, reply to this email or contact us at info@AISchoolonair.com
      </p>
    </div>
  `);
}

async function sendPaymentReceipt({ email, firstName, planName, amount, reference, expiresAt }) {
  const name      = firstName || 'Student';
  const amountStr = amount ? `₦${Number(amount).toLocaleString('en-NG')}` : 'N/A';
  const expiryStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  await send(email, `Payment Confirmed — ${planName}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb">
      <div style="text-align:center;padding:24px 0 16px">
        <h1 style="color:#0a4a3f;font-size:22px;margin:0">AISchoolonair</h1>
        <p style="color:#6b7280;font-size:13px;margin:4px 0 0">Educational Advancement Centre</p>
      </div>
      <div style="background:#fff;border-radius:16px;padding:32px;margin-bottom:20px;border:1px solid #e5e7eb">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:40px">&#x2705;</div>
          <h2 style="color:#111827;font-size:20px;margin:8px 0 4px">Payment Confirmed!</h2>
          <p style="color:#6b7280;font-size:14px;margin:0">Thank you, ${name}. Your subscription is now active.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:10px 0;color:#6b7280">Plan</td>
            <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right">${planName}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:10px 0;color:#6b7280">Amount Paid</td>
            <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right">${amountStr}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:10px 0;color:#6b7280">Transaction Reference</td>
            <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right;font-size:12px">${reference}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280">Access Valid Until</td>
            <td style="padding:10px 0;color:#14b8a6;font-weight:700;text-align:right">${expiryStr}</td>
          </tr>
        </table>
        <div style="text-align:center;margin-top:28px">
          <a href="${APP_URL}/student/dashboard"
             style="display:inline-block;background:#0a4a3f;color:#fff;text-decoration:none;
                    font-weight:600;padding:14px 32px;border-radius:12px;font-size:15px">
            Go to Dashboard &rarr;
          </a>
        </div>
      </div>
      <div style="text-align:center;color:#9ca3af;font-size:12px;padding-top:16px">
        <p style="margin:0">&copy; 2026 AISchoolonair &middot; info@eac.edu.ng</p>
        <p style="margin:4px 0 0">If you did not make this payment, please contact us immediately.</p>
      </div>
    </div>
  `);
}

async function sendVerificationEmail({ email, first_name, token }) {
  const name = first_name || 'Student';
  const link = `${APP_URL}/verify-email?token=${token}`;
  await send(email, 'Verify your AISchoolonair email address ', `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:22px;margin-bottom:8px">Hi ${name}, please verify your email</h1>
      <p style="color:#555;line-height:1.6">
        Click the button below to verify your email address. This link expires in <strong>24 hours</strong>.
      </p>
      <a href="${link}"
         style="display:inline-block;margin-top:16px;background:#14b8a6;color:#fff;
                text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Verify Email →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        If you did not create an account, you can safely ignore this email.
      </p>
    </div>
  `);
}

async function sendPasswordResetEmail({ email, first_name, token }) {
  const name = first_name || 'Student';
  const link = `${APP_URL}/reset-password?token=${token}`;
  await send(email, 'Reset your AISchoolonair password ', `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:22px;margin-bottom:8px">Password reset request</h1>
      <p style="color:#555;line-height:1.6">
        Hi ${name}, we received a request to reset your password.
        Click the button below — this link expires in <strong>1 hour</strong>.
      </p>
      <a href="${link}"
         style="display:inline-block;margin-top:16px;background:#0a4a3f;color:#fff;
                text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Reset Password →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
  `);
}

async function sendTeacherWelcomeEmail({ email, first_name, password }) {
  const name = first_name || 'Teacher';
  await send(email, 'Your AISchoolOnair Teacher Account', `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:22px;margin-bottom:8px">Welcome to AISchoolOnair, ${name}!</h1>
      <p style="color:#555;line-height:1.6">
        Your teacher account has been created by the admin. Here are your login details:
      </p>
      <table style="margin:16px 0;border-collapse:collapse;width:100%">
        <tr>
          <td style="padding:8px 12px;background:#f0fdf4;font-weight:600;color:#166534;border-radius:4px 0 0 4px;width:100px">Email</td>
          <td style="padding:8px 12px;background:#f0fdf4;color:#555;border-radius:0 4px 4px 0">${email}</td>
        </tr>
        <tr><td colspan="2" style="padding:4px"></td></tr>
        <tr>
          <td style="padding:8px 12px;background:#f0fdf4;font-weight:600;color:#166534;border-radius:4px 0 0 4px">Password</td>
          <td style="padding:8px 12px;background:#f0fdf4;color:#555;border-radius:0 4px 4px 0">${password}</td>
        </tr>
      </table>
      <p style="color:#b45309;font-size:13px;margin-bottom:16px">
        Please change your password immediately after logging in.
      </p>
      <a href="${APP_URL}/login"
         style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;
                font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Log in now →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        AISchoolOnair · Nigeria's AI-powered exam prep platform
      </p>
    </div>
  `);
}

// Used by POST /api/schools/me/invite — same "here's your login, change it
// after first login" pattern as sendTeacherWelcomeEmail, but role-accurate
// copy (that one always says "Teacher Account", which would be wrong and
// confusing for a student invited by their school_admin) and mentions the
// school by name so the recipient knows who set this account up for them.
async function sendSchoolMemberWelcomeEmail({ email, first_name, password, role, school_name }) {
  const name = first_name || (role === 'teacher' ? 'Teacher' : 'Student');
  const roleLabel = role === 'teacher' ? 'Teacher' : 'Student';
  await send(email, `Your AISchoolOnair ${roleLabel} Account`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:22px;margin-bottom:8px">Welcome to AISchoolOnair, ${name}!</h1>
      <p style="color:#555;line-height:1.6">
        Your ${roleLabel.toLowerCase()} account has been created by ${school_name || 'your school'}'s admin.
        Here are your login details:
      </p>
      <table style="margin:16px 0;border-collapse:collapse;width:100%">
        <tr>
          <td style="padding:8px 12px;background:#f0fdf4;font-weight:600;color:#166534;border-radius:4px 0 0 4px;width:100px">Email</td>
          <td style="padding:8px 12px;background:#f0fdf4;color:#555;border-radius:0 4px 4px 0">${email}</td>
        </tr>
        <tr><td colspan="2" style="padding:4px"></td></tr>
        <tr>
          <td style="padding:8px 12px;background:#f0fdf4;font-weight:600;color:#166534;border-radius:4px 0 0 4px">Password</td>
          <td style="padding:8px 12px;background:#f0fdf4;color:#555;border-radius:0 4px 4px 0">${password}</td>
        </tr>
      </table>
      <p style="color:#b45309;font-size:13px;margin-bottom:16px">
        Please change your password immediately after logging in.
      </p>
      <a href="${APP_URL}/login"
         style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;
                font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Log in now →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        AISchoolOnair · Nigeria's AI-powered exam prep platform
      </p>
    </div>
  `);
}

module.exports = {
  send,
  sendWelcomeEmail,
  sendTeacherWelcomeEmail,
  sendSchoolMemberWelcomeEmail,
  sendWeeklyDigest,
  sendStreakNudge,
  sendPaymentConfirmation,
  sendPaymentReceipt,
  sendVerificationEmail,
  sendPasswordResetEmail,
};

// server/services/emailService.js
// Nodemailer-based email service.
// Requires in .env:
//   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
// Optional: EMAIL_SECURE=true for port 465

const nodemailer = require('nodemailer');

// ── Transporter (lazy-init so missing env doesn't crash startup) ──────────────
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  // Support both EMAIL_* (emailService) and SMTP_* (auth.js) naming conventions
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587;

  if (!host || !user) {
    console.warn('[emailService] EMAIL_HOST / EMAIL_USER not set — emails disabled');
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

const FROM    = process.env.EMAIL_FROM || 'EACbuddy <noreply@eacbuddy.com>';
const APP_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ── Helper ────────────────────────────────────────────────────────────────────
async function send(to, subject, html) {
  const t = getTransporter();
  if (!t) return; // silently skip if email not configured
  try {
    await t.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[emailService] Failed to send to ${to}:`, err.message);
  }
}

// ── Welcome email ─────────────────────────────────────────────────────────────
async function sendWelcomeEmail(user) {
  const name = user.first_name || user.firstName || 'Student';
  await send(user.email, 'Welcome to EACbuddy! 🎓', `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:24px;margin-bottom:8px">Welcome to EACbuddy, ${name}! 🎓</h1>
      <p style="color:#555;line-height:1.6">
        You now have access to <strong>5 free practice questions per day</strong> across JAMB, WAEC and NECO subjects.
        Each question comes with instant AI feedback so you know exactly what the examiner expects.
      </p>
      <a href="${APP_URL}/student/dashboard"
         style="display:inline-block;margin-top:20px;background:#14b8a6;color:#fff;text-decoration:none;
                font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Start Practising →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        EACbuddy · Nigeria's AI-powered exam prep platform<br>
        <a href="${APP_URL}/pricing" style="color:#14b8a6">Upgrade to unlimited access</a>
      </p>
    </div>
  `);
}

// ── Weekly digest ─────────────────────────────────────────────────────────────
async function sendWeeklyDigest(user, stats) {
  const name = user.first_name || 'Student';
  const {
    best_subject   = 'Not yet determined',
    weakest_topic  = 'Not yet determined',
    streak         = 0,
    accuracy_pct   = 0,
    weakest_subtopic_id,
  } = stats;

  const practiceLink = weakest_subtopic_id
    ? `${APP_URL}/student/subtopic/${weakest_subtopic_id}?tab=practice`
    : `${APP_URL}/student/dashboard`;

  await send(user.email, `${name}, here's your EACbuddy week in review 📊`, `
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
          <p style="color:#701a75;font-weight:700;font-size:16px;margin:0">${streak} days 🔥</p>
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
        EACbuddy · <a href="${APP_URL}/student/dashboard" style="color:#14b8a6">Open dashboard</a>
      </p>
    </div>
  `);
}

// ── Streak nudge ──────────────────────────────────────────────────────────────
async function sendStreakNudge(user, daysSince) {
  const name = user.first_name || 'Student';
  await send(user.email, `${name}, your study streak is at risk! ⚡`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">⚡</div>
      <h1 style="color:#0a4a3f;font-size:20px">Don't break your streak, ${name}!</h1>
      <p style="color:#555;line-height:1.6">
        You haven't practised in <strong>${daysSince} days</strong>.
        Just 5 questions today is enough to keep your streak alive.
      </p>
      <a href="${APP_URL}/student/dashboard"
         style="display:inline-block;margin-top:20px;background:#f59e0b;color:#111;text-decoration:none;
                font-weight:700;padding:12px 28px;border-radius:12px;font-size:14px">
        Resume Studying →
      </a>
    </div>
  `);
}

// ── Payment confirmation ──────────────────────────────────────────────────────
async function sendPaymentConfirmation(user, plan, endDate) {
  const name     = user.first_name || 'Student';
  const planName = plan === 'annual' ? '12-Month Plan' : '1-Month Plan';
  const expiry   = endDate instanceof Date
    ? endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : String(endDate);

  await send(user.email, `Payment confirmed — ${planName} activated ✅`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#0a4a3f;font-size:20px;margin-bottom:4px">Payment confirmed, ${name}! ✅</h1>
      <p style="color:#555;line-height:1.6">
        Your <strong>${planName}</strong> is now active. You have unlimited access to all
        practice questions, AI explanations, and quiz features until <strong>${expiry}</strong>.
      </p>
      <a href="${APP_URL}/student/dashboard"
         style="display:inline-block;margin-top:20px;background:#14b8a6;color:#fff;text-decoration:none;
                font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
        Start Studying →
      </a>
      <p style="color:#aaa;font-size:12px;margin-top:32px">
        If you have questions, reply to this email or contact us at info@eacbuddy.com
      </p>
    </div>
  `);
}

// ── Payment receipt ───────────────────────────────────────────────────────────
async function sendPaymentReceipt({ email, firstName, planName, amount, reference, expiresAt }) {
  const name      = firstName || 'Student';
  const amountStr = amount
    ? `₦${Number(amount).toLocaleString('en-NG')}`
    : 'N/A';
  const expiryStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  await send(email, `Payment Confirmed — ${planName}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb">

      <!-- Header -->
      <div style="text-align:center;padding:24px 0 16px">
        <h1 style="color:#0a4a3f;font-size:22px;margin:0">EAC Learning Platform</h1>
        <p style="color:#6b7280;font-size:13px;margin:4px 0 0">Educational Advancement Centre</p>
      </div>

      <!-- Card -->
      <div style="background:#fff;border-radius:16px;padding:32px;margin-bottom:20px;border:1px solid #e5e7eb">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:40px">&#x2705;</div>
          <h2 style="color:#111827;font-size:20px;margin:8px 0 4px">Payment Confirmed!</h2>
          <p style="color:#6b7280;font-size:14px;margin:0">Thank you, ${name}. Your subscription is now active.</p>
        </div>

        <!-- Receipt table -->
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

        <!-- CTA -->
        <div style="text-align:center;margin-top:28px">
          <a href="${APP_URL}/student/dashboard"
             style="display:inline-block;background:#0a4a3f;color:#fff;text-decoration:none;
                    font-weight:600;padding:14px 32px;border-radius:12px;font-size:15px">
            Go to Dashboard &rarr;
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align:center;color:#9ca3af;font-size:12px;padding-top:16px">
        <p style="margin:0">&copy; 2026 EAC Learning Platform &middot; info@eac.edu.ng</p>
        <p style="margin:4px 0 0">+234 809 012 3412 &middot; +234 803 123 1234</p>
        <p style="margin:4px 0 0">If you did not make this payment, please contact us immediately.</p>
      </div>
    </div>
  `);
}

module.exports = {
  sendWelcomeEmail,
  sendWeeklyDigest,
  sendStreakNudge,
  sendPaymentConfirmation,
  sendPaymentReceipt,
};

// server/routes/paymentRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Paystack NGN payment integration for AISchoolonair
//
// Endpoints:
//   GET    /api/payments/plans               — list all active subscription plans
//   POST   /api/payments/initialize          — create Paystack transaction
//   GET    /api/payments/verify/:reference   — verify payment + activate subscription
//   POST   /api/payments/webhook             — Paystack server-to-server events
//   GET    /api/payments/subscription        — get current user's active subscription
//
// npm install: npm install axios crypto
//
// .env variables required:
//   PAYSTACK_SECRET_KEY=sk_live_...   (or sk_test_... for testing)
//   PAYSTACK_WEBHOOK_SECRET=...       (from Paystack dashboard → Settings → API)
//   CLIENT_URL=http://localhost:5173
// ─────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const router    = express.Router();
const axios     = require('axios');
const crypto    = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');
const { ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const CLIENT_URL      = process.env.CLIENT_URL || 'http://localhost:5173';

// ── Paystack API helper ───────────────────────────────────────────────────────
const paystackAPI = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/plans
// Return all active subscription plans for the pricing page.
// Public — no auth required.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', async (req, res) => {
  try {
    const plans = await sequelize.query(
      `SELECT
         id, plan_code, plan_name, price_monthly, price_yearly, currency,
         features, max_exam_boards, max_subjects,
         has_analytics, has_video_access, has_test_builder, is_active
       FROM subscription_plans
       WHERE is_active = true
       ORDER BY
         CASE plan_code
           WHEN 'FREE_TRIAL'      THEN 1
           WHEN 'STUDENT_MONTHLY' THEN 2
           WHEN 'STUDENT_YEARLY'  THEN 3
           WHEN 'TEACHER_YEARLY'  THEN 4
           ELSE 5
         END`,
      { type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: plans });
  } catch (err) {
    console.error('[GET /payments/plans] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/initialize
// Creates a Paystack transaction and returns the payment URL.
// Body: { plan_code }  e.g. 'STUDENT_MONTHLY' | 'STUDENT_YEARLY'
// ─────────────────────────────────────────────────────────────────────────────
router.post('/initialize', protect, async (req, res) => {
  const { plan_code } = req.body;

  if (!plan_code) {
    return res.status(400).json({ success: false, error: 'plan_code is required' });
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return res.status(503).json({ success: false, error: 'Payment service is not configured. Please contact support.' });
  }

  try {
    // ── 1. Fetch plan from DB ─────────────────────────────────────────────────
    const plans = await sequelize.query(
      `SELECT id, plan_code, plan_name, price_monthly, price_yearly, currency
       FROM subscription_plans
       WHERE plan_code = :plan_code AND is_active = true`,
      { replacements: { plan_code }, type: QueryTypes.SELECT }
    );

    if (!plans.length) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const plan = plans[0];

    // ── 2. Determine amount (Paystack uses kobo: 1 NGN = 100 kobo) ───────────
    // FREE_TRIAL plans skip Paystack entirely
    if (plan.plan_code === 'FREE_TRIAL') {
      return res.status(400).json({
        success: false,
        error: 'Free trial does not require payment. It is activated automatically.',
      });
    }

    // Pick monthly vs yearly price
    const amountNGN = plan.price_monthly ?? plan.price_yearly;
    if (!amountNGN || amountNGN <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid plan price' });
    }
    const amountKobo = amountNGN * 100;

    // ── 3. Create pending transaction record in DB ────────────────────────────
    const reference = `EAC-${Date.now()}-${req.user.id.slice(0, 8)}`;

    await sequelize.query(
      `INSERT INTO payment_transactions
         (user_id, transaction_reference, payment_gateway, amount, currency, status, metadata, created_at)
       VALUES
         (:userId, :reference, 'paystack', :amount, :currency, 'pending',
          :metadata::jsonb, NOW())`,
      {
        replacements: {
          userId:    req.user.id,
          reference,
          amount:    amountNGN,
          currency:  plan.currency || 'NGN',
          metadata:  JSON.stringify({ plan_code, plan_id: plan.id, plan_name: plan.plan_name }),
        },
        type: QueryTypes.INSERT,
      }
    );

    // ── 4. Initialize transaction with Paystack ───────────────────────────────
    const paystackRes = await paystackAPI.post('/transaction/initialize', {
      email:        req.user.email,
      amount:       amountKobo,
      currency:     'NGN',
      reference,
      callback_url: `${CLIENT_URL}/payment/verify?reference=${reference}`,
      metadata: {
        user_id:    req.user.id,
        plan_code,
        plan_id:    plan.id,
        plan_name:  plan.plan_name,
        full_name:  `${req.user.first_name} ${req.user.last_name}`,
      },
    });

    if (!paystackRes.data.status) {
      throw new Error(paystackRes.data.message || 'Paystack initialization failed');
    }

    const { authorization_url, access_code } = paystackRes.data.data;

    // Store Paystack reference back to DB
    await sequelize.query(
      `UPDATE payment_transactions
       SET paystack_reference = :paystackRef
       WHERE transaction_reference = :reference`,
      {
        replacements: { paystackRef: access_code, reference },
        type: QueryTypes.UPDATE,
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        authorization_url,   // redirect user to this URL
        reference,           // our internal reference
        amount:    amountNGN,
        plan_name: plan.plan_name,
      },
    });

  } catch (err) {
    console.error('[POST /payments/initialize] Error:', err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      error: err.response?.data?.message || 'Payment initialization failed',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/verify/:reference
// Called after Paystack redirects the user back to /payment/verify.
// Verifies with Paystack, then creates the user subscription on success.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/verify/:reference', protect, async (req, res) => {
  const { reference } = req.params;

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return res.status(503).json({ success: false, error: 'Payment service is not configured. Please contact support.' });
  }

  try {
    // ── 1. Fetch transaction from our DB ─────────────────────────────────────
    const txRows = await sequelize.query(
      `SELECT * FROM payment_transactions
       WHERE transaction_reference = :reference AND user_id = :userId`,
      {
        replacements: { reference, userId: req.user.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!txRows.length) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const tx = txRows[0];

    if (tx.status === 'successful') {
      return res.status(200).json({ success: true, message: 'Payment already verified', data: tx });
    }

    // ── 2. Verify with Paystack ───────────────────────────────────────────────
    const paystackRes = await paystackAPI.get(`/transaction/verify/${reference}`);

    if (!paystackRes.data.status) {
      throw new Error('Paystack verification request failed');
    }

    const paystackTx = paystackRes.data.data;

    if (paystackTx.status !== 'success') {
      // Mark as failed
      await sequelize.query(
        `UPDATE payment_transactions
         SET status = 'failed', completed_at = NOW()
         WHERE transaction_reference = :reference`,
        { replacements: { reference }, type: QueryTypes.UPDATE }
      );
      return res.status(402).json({
        success: false,
        error: `Payment ${paystackTx.status}. Please try again.`,
      });
    }

    // ── 3. Payment successful — get plan details ──────────────────────────────
    const metadata = tx.metadata || {};
    const planId   = metadata.plan_id;

    const planRows = await sequelize.query(
      `SELECT * FROM subscription_plans WHERE id = :planId`,
      { replacements: { planId }, type: QueryTypes.SELECT }
    );

    if (!planRows.length) {
      throw new Error('Plan not found for subscription creation');
    }

    const plan = planRows[0];

    // ── 4. Calculate subscription end date ───────────────────────────────────
    const now     = new Date();
    const endDate = new Date(now);
    if (plan.price_monthly && !plan.price_yearly) {
      endDate.setMonth(endDate.getMonth() + 1);   // monthly plan
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1); // yearly plan
    }

    // ── 5. Deactivate any existing active subscription ────────────────────────
    await sequelize.query(
      `UPDATE user_subscriptions
       SET status = 'expired', updated_at = NOW()
       WHERE user_id = :userId AND status = 'active'`,
      { replacements: { userId: req.user.id }, type: QueryTypes.UPDATE }
    );

    // ── 6. Create new subscription ────────────────────────────────────────────
    const subInserted = await sequelize.query(
      `INSERT INTO user_subscriptions
         (user_id, plan_id, start_date, end_date, status,
          payment_reference, amount_paid, created_at, updated_at)
       VALUES
         (:userId, :planId, NOW(), :endDate, 'active',
          :reference, :amount, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          userId:    req.user.id,
          planId:    plan.id,
          endDate:   endDate.toISOString(),
          reference,
          amount:    tx.amount,
        },
        type: QueryTypes.INSERT,
      }
    );

    const subscriptionId = subInserted[0][0].id;

    // ── 7a. Sync subscription_status on users table ───────────────────────────
    // subscriptionGuard reads users.subscription_status directly for performance.
    // Without this update, paying students are still treated as free (5 q/day limit).
    await sequelize.query(
      `UPDATE users
       SET subscription_status      = 'active',
           subscription_expires_at  = :endDate
       WHERE id = :userId`,
      {
        replacements: { endDate: endDate.toISOString(), userId: req.user.id },
        type: QueryTypes.UPDATE,
      }
    );

    // ── 7. Mark transaction as successful ─────────────────────────────────────
    await sequelize.query(
      `UPDATE payment_transactions
       SET status = 'successful',
           subscription_id = :subscriptionId,
           payment_method = :paymentMethod,
           completed_at = NOW()
       WHERE transaction_reference = :reference`,
      {
        replacements: {
          subscriptionId,
          paymentMethod: paystackTx.channel || 'card',
          reference,
        },
        type: QueryTypes.UPDATE,
      }
    );

    // ── Send payment receipt email (non-fatal) ───────────────────────────────
    try {
      const { sendPaymentReceipt } = require('../services/emailService');
      await sendPaymentReceipt({
        email:     req.user.email,
        firstName: req.user.first_name,
        planName:  plan.plan_name,
        amount:    tx.amount,
        reference: reference,
        expiresAt: endDate.toISOString(),
      });
    } catch (emailErr) {
      console.warn('[PaymentVerify] Receipt email failed:', emailErr.message);
      // Non-fatal — payment is still successful
    }

    return res.status(200).json({
      success: true,
      message: `${plan.plan_name} subscription activated successfully`,
      data: {
        subscription_id: subscriptionId,
        plan_name:        plan.plan_name,
        start_date:       now.toISOString(),
        end_date:         endDate.toISOString(),
        amount_paid:      tx.amount,
      },
    });

  } catch (err) {
    console.error('[GET /payments/verify] Error:', err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      error: err.response?.data?.message || 'Payment verification failed',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Paystack sends POST requests here for asynchronous payment events.
// IMPORTANT: Register this URL in Paystack dashboard → Settings → API & Webhooks
// This endpoint does NOT use auth middleware — Paystack calls it directly.
// Security is via HMAC-SHA512 signature verification.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-paystack-signature'];

  if (!signature) {
    return res.status(400).send('Missing signature');
  }

  // ── Verify Paystack signature ─────────────────────────────────────────────
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] PAYSTACK_WEBHOOK_SECRET and PAYSTACK_SECRET_KEY are both unset — cannot verify webhook');
    return res.status(503).send('Webhook signing secret not configured');
  }
  const hash = crypto
    .createHmac('sha512', webhookSecret)
    .update(req.body)
    .digest('hex');

  if (hash !== signature) {
    console.warn('[Webhook] Invalid Paystack signature — ignoring');
    return res.status(401).send('Invalid signature');
  }

  // ── Parse event ───────────────────────────────────────────────────────────
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  console.log(`[Webhook] Received event: ${event.event}`);

  // Acknowledge immediately — Paystack expects 200 quickly
  res.status(200).send('OK');

  // ── Handle events asynchronously ──────────────────────────────────────────
  try {
    switch (event.event) {

      case 'charge.success': {
        const data      = event.data;
        const reference = data.reference;
        const metadata  = data.metadata || {};

        // Check if we already processed this (idempotency)
        const existing = await sequelize.query(
          `SELECT status FROM payment_transactions WHERE transaction_reference = :reference`,
          { replacements: { reference }, type: QueryTypes.SELECT }
        );

        if (existing[0]?.status === 'successful') {
          console.log(`[Webhook] charge.success already processed for ${reference}`);
          break;
        }

        // Get plan details
        const planId   = metadata.plan_id;
        const planRows = await sequelize.query(
          `SELECT * FROM subscription_plans WHERE id = :planId`,
          { replacements: { planId }, type: QueryTypes.SELECT }
        );

        if (!planRows.length) {
          console.error(`[Webhook] Plan ${planId} not found for reference ${reference}`);
          break;
        }

        const plan   = planRows[0];
        const userId = metadata.user_id;

        if (!userId) {
          console.error(`[Webhook] No user_id in metadata for reference ${reference}`);
          break;
        }

        // Calculate end date
        const endDate = new Date();
        if (plan.price_monthly && !plan.price_yearly) {
          endDate.setMonth(endDate.getMonth() + 1);
        } else {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }

        // Deactivate old subscription
        await sequelize.query(
          `UPDATE user_subscriptions SET status = 'expired', updated_at = NOW()
           WHERE user_id = :userId AND status = 'active'`,
          { replacements: { userId }, type: QueryTypes.UPDATE }
        );

        // Create subscription
        const subResult = await sequelize.query(
          `INSERT INTO user_subscriptions
             (user_id, plan_id, start_date, end_date, status,
              payment_reference, amount_paid, created_at, updated_at)
           VALUES (:userId, :planId, NOW(), :endDate, 'active', :reference, :amount, NOW(), NOW())
           ON CONFLICT DO NOTHING
           RETURNING id`,
          {
            replacements: {
              userId,
              planId: plan.id,
              endDate: endDate.toISOString(),
              reference,
              amount: data.amount / 100,
            },
            type: QueryTypes.INSERT,
          }
        );

        const subscriptionId = subResult[0]?.[0]?.id;

        // Sync subscription_status on users table so subscriptionGuard passes
        await sequelize.query(
          `UPDATE users
           SET subscription_status     = 'active',
               subscription_expires_at = :endDate
           WHERE id = :userId`,
          { replacements: { endDate: endDate.toISOString(), userId }, type: QueryTypes.UPDATE }
        ).catch(e => console.warn('[Webhook] Could not sync subscription_status:', e.message));

        // Mark transaction as successful
        await sequelize.query(
          `UPDATE payment_transactions
           SET status = 'successful',
               subscription_id = :subscriptionId,
               payment_method = :method,
               completed_at = NOW()
           WHERE transaction_reference = :reference`,
          {
            replacements: {
              subscriptionId: subscriptionId || null,
              method: data.channel || 'card',
              reference,
            },
            type: QueryTypes.UPDATE,
          }
        );

        console.log(`[Webhook]  Subscription activated for user ${userId}, plan ${plan.plan_name}`);
        break;
      }

      case 'charge.failed': {
        const reference = event.data.reference;
        await sequelize.query(
          `UPDATE payment_transactions
           SET status = 'failed', completed_at = NOW()
           WHERE transaction_reference = :reference`,
          { replacements: { reference }, type: QueryTypes.UPDATE }
        );
        console.log(`[Webhook]  Payment failed for reference ${reference}`);
        break;
      }

      case 'subscription.disable': {
        // Paystack managed recurring subscription was cancelled
        const customerEmail = event.data.customer?.email;
        if (customerEmail) {
          await sequelize.query(
            `UPDATE user_subscriptions us
             SET status = 'cancelled', updated_at = NOW()
             FROM users u
             WHERE u.id = us.user_id
               AND u.email = :email
               AND us.status = 'active'`,
            { replacements: { email: customerEmail }, type: QueryTypes.UPDATE }
          );
          console.log(`[Webhook] Subscription cancelled for ${customerEmail}`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.event}`);
    }
  } catch (err) {
    // Never crash — Paystack will retry if we return non-200, but we already sent 200
    console.error('[Webhook] Processing error:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/subscription
// Get the current user's active subscription and plan details.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/subscription', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         us.id, us.status, us.start_date, us.end_date,
         us.amount_paid, us.auto_renew,
         sp.plan_code, sp.plan_name, sp.features,
         sp.has_analytics, sp.has_video_access, sp.has_test_builder,
         sp.max_exam_boards, sp.max_subjects
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = :userId
         AND us.status = 'active'
         AND us.end_date > NOW()
       ORDER BY us.created_at DESC
       LIMIT 1`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No active subscription',
      });
    }

    const sub = rows[0];
    const daysLeft = Math.ceil(
      (new Date(sub.end_date) - new Date()) / (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      success: true,
      data: { ...sub, days_remaining: daysLeft },
    });
  } catch (err) {
    console.error('[GET /payments/subscription] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/cancel
// Cancels the student's subscription — access continues until expiry date.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cancel', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user has an active or free_trial subscription
    const userRows = await sequelize.query(
      `SELECT subscription_status, subscription_expires_at FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { subscription_status, subscription_expires_at } = userRows[0];

    if (!['active', 'free_trial'].includes(subscription_status)) {
      return res.status(400).json({ success: false, error: 'No active subscription to cancel' });
    }

    // Set to cancelled — access continues until existing expiry date
    await sequelize.query(
      `UPDATE users SET subscription_status = 'cancelled', updated_at = NOW() WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.UPDATE }
    );

    const expiryDate = subscription_expires_at
      ? new Date(subscription_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return res.json({
      success: true,
      message: expiryDate
        ? `Subscription cancelled. Access continues until ${expiryDate}.`
        : 'Subscription cancelled successfully.',
      expires_at: subscription_expires_at,
    });
  } catch (err) {
    console.error('[POST /payments/cancel] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/activate-exam-types
//
// Called by PaymentVerify.jsx after Paystack payment is confirmed.
// Reads users.pending_exam_board_ids, creates student_exam_types rows
// linked to the new subscription, then clears the pending column.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/activate-exam-types', protect, async (req, res) => {
  const studentId      = req.user.id;
  const subscriptionId = req.body?.subscription_id || null;

  try {
    const userRows = await sequelize.query(
      `SELECT pending_exam_board_ids FROM users WHERE id = :id`,
      { replacements: { id: studentId }, type: QueryTypes.SELECT }
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const pendingIds = userRows[0].pending_exam_board_ids || [];

    if (pendingIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending exam types to activate',
        activated: 0,
      });
    }

    // Resolve subscription end date if provided
    let expiresAt = null;
    if (subscriptionId) {
      const subRows = await sequelize.query(
        `SELECT end_date FROM user_subscriptions WHERE id = :id AND user_id = :userId`,
        { replacements: { id: subscriptionId, userId: studentId }, type: QueryTypes.SELECT }
      );
      if (subRows.length) expiresAt = subRows[0].end_date;
    }

    // Insert into student_exam_types, upsert on conflict
    let activated = 0;
    for (const boardId of pendingIds) {
      await sequelize.query(
        `INSERT INTO student_exam_types
           (student_id, exam_board_id, subscription_id, granted_at, expires_at, is_active, status)
         VALUES (:studentId, :boardId, :subscriptionId, NOW(), :expiresAt, true, :approvedStatus)
         ON CONFLICT (student_id, exam_board_id) DO UPDATE SET
           is_active       = true,
           status          = :approvedStatus,
           subscription_id = EXCLUDED.subscription_id,
           expires_at      = EXCLUDED.expires_at,
           granted_at      = NOW()`,
        {
          replacements: {
            studentId,
            boardId,
            subscriptionId: subscriptionId || null,
            expiresAt:      expiresAt      || null,
            approvedStatus: ENROLLMENT_STATUS.APPROVED,
          },
          type: QueryTypes.INSERT,
        }
      );
      activated++;
    }

    // Clear pending_exam_board_ids after activation
    await sequelize.query(
      `UPDATE users SET pending_exam_board_ids = '{}' WHERE id = :id`,
      { replacements: { id: studentId }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({
      success: true,
      message: `${activated} examination type(s) activated`,
      activated,
    });

  } catch (err) {
    console.error('[POST /payments/activate-exam-types]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to activate exam types' });
  }
});

module.exports = router;

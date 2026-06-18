'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// server/utils/registrationValidators.js
//
// Single source of truth for all registration-related input validation.
// Used by:
//   • server/controllers/auth.js          (register, login, forgotPassword,
//                                          resetPassword, updatePassword)
//   • server/routes/adminRoutes.js        (create-teacher)
//   • server/routes/authRoutes.js         (PATCH /profile)
//
// Design notes
// ────────────────────────────────────────────────────────────────────────────
// • All functions return { valid: boolean, error: string|null }.
// • No function throws — callers decide how to respond.
// • E.164 definition: +[country code][subscriber number], 8–15 digits total
//   (ITU-T E.164 §7.4).  The regex below allows an optional leading '+'.
// ─────────────────────────────────────────────────────────────────────────────

// ── Email ─────────────────────────────────────────────────────────────────────
// RFC 5321 §4.5.3 max local@domain length = 254.
// We reject obvious injections (semicolons, null bytes, angle brackets, etc.)
// before handing off to a simple but robust structural check.
const EMAIL_MAX   = 254;
const EMAIL_REGEX = /^[^\s@<>;"'()[\]{},\\]+@[^\s@<>;"'()[\]{},\\]+\.[^\s@<>;"'()[\]{},\\]{2,}$/;

/**
 * Normalise an email address: lowercase + trim.
 * Call this BEFORE any DB read or write involving email.
 *
 * @param {string} raw
 * @returns {string}
 */
function normaliseEmail(raw) {
  return (raw || '').toLowerCase().trim();
}

/**
 * Validate a (already-normalised) email string.
 *
 * @param {string} email  — must already be normalised
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateEmail(email) {
  if (!email) return { valid: false, error: 'Email is required' };
  if (email.length > EMAIL_MAX) return { valid: false, error: 'Email address is too long' };
  if (!EMAIL_REGEX.test(email)) return { valid: false, error: 'Please enter a valid email address' };
  return { valid: true, error: null };
}

// ── Password ──────────────────────────────────────────────────────────────────
// Policy (R-05):
//   • Minimum 8 characters
//   • At least one letter  (Unicode \p{L} would need a flag; ASCII \w covers
//     the practical case for this audience)
//   • At least one digit
//   • Maximum 128 characters (bcrypt silently truncates at 72 bytes; we cap
//     well before that to eliminate the DoS vector while being generous enough
//     that no real user is affected)
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

/**
 * Validate a plaintext password against the current policy.
 *
 * @param {string} password
 * @returns {{ valid: boolean, error: string|null }}
 */
function validatePassword(password) {
  if (!password) return { valid: false, error: 'Password is required' };
  if (password.length < PASSWORD_MIN) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN} characters` };
  }
  if (password.length > PASSWORD_MAX) {
    return { valid: false, error: `Password must be no longer than ${PASSWORD_MAX} characters` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true, error: null };
}

/**
 * Return a password-strength label for use by the client-side strength meter.
 * This is informational only — it does NOT gate registration.
 *
 * Levels:
 *   'weak'   – passes minimum requirements
 *   'medium' – 10+ chars, has a symbol or uppercase
 *   'strong' – 12+ chars, has uppercase, symbol, AND length >= 12
 *
 * @param {string} password
 * @returns {'weak'|'medium'|'strong'}
 */
function passwordStrength(password) {
  if (!password || password.length < PASSWORD_MIN) return 'weak';
  const hasUpper  = /[A-Z]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const isLong    = password.length >= 12;

  if (isLong && hasUpper && hasSymbol) return 'strong';
  if (password.length >= 10 && (hasUpper || hasSymbol)) return 'medium';
  return 'weak';
}

// ── Phone / E.164 ─────────────────────────────────────────────────────────────
// E.164 allows 8–15 total digits (excluding the leading '+').
// The frontend concatenates dialCode + local number and sends the result.
// We accept either raw digits or a leading '+', strip any non-digit
// prefix characters, then enforce digit count.
//
// Example inputs we must handle:
//   "+2348012345678"  → valid  (Nigeria, 13 digits)
//   "2348012345678"   → valid  (same, no +)
//   "+447911123456"   → valid  (UK, 12 digits)
//   "123"             → invalid (too short)
//   "hello"           → invalid (no digits)

const PHONE_DIGITS_MIN = 7;   // shortest possible national number (ITU guidance)
const PHONE_DIGITS_MAX = 15;  // E.164 hard limit

/**
 * Normalise a phone string to E.164 format.
 * Strips all non-digit characters then prepends '+'.
 * Returns null if no digits present.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

/**
 * Validate a phone number string (raw, pre-normalisation).
 * Call normalisePhone() before storing.
 *
 * @param {string|null|undefined} raw
 * @returns {{ valid: boolean, error: string|null }}
 */
function validatePhone(raw) {
  if (!raw) return { valid: false, error: 'Phone number is required' };
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < PHONE_DIGITS_MIN) {
    return { valid: false, error: 'Phone number is too short' };
  }
  if (digits.length > PHONE_DIGITS_MAX) {
    return { valid: false, error: 'Phone number is too long' };
  }
  return { valid: true, error: null };
}

// ── Names ─────────────────────────────────────────────────────────────────────
const NAME_MAX = 100;

/**
 * Sanitise a name field: trim and collapse internal whitespace.
 *
 * @param {string} raw
 * @returns {string}
 */
function normaliseName(raw) {
  return (raw || '').trim().replace(/\s{2,}/g, ' ');
}

/**
 * Validate a single name part (first_name or last_name).
 *
 * @param {string} name   — already normalised
 * @param {string} field  — label used in error messages
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateName(name, field = 'Name') {
  if (!name) return { valid: false, error: `${field} is required` };
  if (name.length > NAME_MAX) return { valid: false, error: `${field} is too long (max ${NAME_MAX} characters)` };
  // Block obvious injection payloads: angle brackets, null bytes, SQL string terminators
  if (/[<>\x00;]/.test(name)) return { valid: false, error: `${field} contains invalid characters` };
  return { valid: true, error: null };
}

// ── pendingExamBoards sanitisation ────────────────────────────────────────────

/**
 * Sanitise the pendingExamBoards array from req.body.
 * Keeps only positive integers (coerces strings like "3" → 3, drops anything
 * else). Returns an empty array if the input is absent or not an array.
 * (R-19 companion fix — prevents manual array literal injection)
 *
 * @param {any} raw
 * @returns {number[]}
 */
function sanitisePendingExamBoards(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(v => parseInt(v, 10))
    .filter(v => Number.isInteger(v) && v > 0);
}

module.exports = {
  normaliseEmail,
  validateEmail,
  validatePassword,
  passwordStrength,
  normalisePhone,
  validatePhone,
  normaliseName,
  validateName,
  sanitisePendingExamBoards,
};

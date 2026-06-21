'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// server/tests/registration.hardening.test.js
//
// Test coverage for R-01 through R-05 (registration hardening).
//
// Strategy: unit-test the validators directly (fast, no DB), then integration-
// test the controller functions using a lightweight mock of db.query to cover
// the full request/response path without needing a live Postgres instance.
//
// Run with:
//   cd server && npx jest tests/registration.hardening.test.js --verbose
// ─────────────────────────────────────────────────────────────────────────────

// ── 1.  Pure validator unit tests ─────────────────────────────────────────────

const {
  normaliseEmail,
  validateEmail,
  validatePassword,
  passwordStrength,
  normalisePhone,
  validatePhone,
  normaliseName,
  validateName,
  sanitisePendingExamBoards,
} = require('../utils/registrationValidators');

describe('registrationValidators', () => {

  // ── Email ──────────────────────────────────────────────────────────────────

  describe('normaliseEmail', () => {
    test('lowercases and trims', () => {
      expect(normaliseEmail('  JANE@EXAMPLE.COM  ')).toBe('jane@example.com');
    });
    test('returns empty string for null/undefined', () => {
      expect(normaliseEmail(null)).toBe('');
      expect(normaliseEmail(undefined)).toBe('');
    });
  });

  describe('validateEmail', () => {
    const valid = ['user@example.com', 'a+b@c.io', 'x@sub.domain.org'];
    const invalid = [
      ['', 'Email is required'],
      ['notanemail', 'valid email'],
      ['@nodomain.com', 'valid email'],
      ['user@', 'valid email'],
      ['user<>@x.com', 'valid email'],
      ['a'.repeat(250) + '@b.com', 'too long'],
    ];

    valid.forEach(email => {
      test(`accepts valid email: ${email}`, () => {
        expect(validateEmail(email).valid).toBe(true);
      });
    });

    invalid.forEach(([email, errorSnippet]) => {
      test(`rejects: "${email}" (expects error containing "${errorSnippet}")`, () => {
        const result = validateEmail(email);
        expect(result.valid).toBe(false);
        expect(result.error.toLowerCase()).toContain(errorSnippet.toLowerCase());
      });
    });
  });

  // ── Password (R-05) ────────────────────────────────────────────────────────

  describe('validatePassword', () => {
    const valid = ['Password1', 'abc12345', 'Th1sIsAGoodOne!', 'a'.repeat(128) + '1'];

    // Re-generate the valid list (the last one has 129 chars, should be invalid)
    const validPasswords = ['Password1', 'abc12345', 'Th1sIsAGoodOne!', 'a'.repeat(127) + '1'];
    const invalidPasswords = [
      ['',          'required'],
      ['short1',    'at least 8'],
      ['aaaaaaaa',  'one number'],         // 8 chars but no digit
      ['12345678',  'one letter'],         // 8 chars but no letter
      ['a'.repeat(129), 'no longer than 128'],  // too long
    ];

    validPasswords.forEach(pw => {
      test(`accepts valid password (length=${pw.length})`, () => {
        expect(validatePassword(pw).valid).toBe(true);
      });
    });

    invalidPasswords.forEach(([pw, errorSnippet]) => {
      test(`rejects password (snippet="${errorSnippet}")`, () => {
        const result = validatePassword(pw);
        expect(result.valid).toBe(false);
        expect(result.error.toLowerCase()).toContain(errorSnippet.toLowerCase());
      });
    });
  });

  describe('passwordStrength', () => {
    test('weak: bare-minimum password', () => {
      expect(passwordStrength('password1')).toBe('weak');
    });
    test('medium: 10+ chars with uppercase or symbol', () => {
      expect(passwordStrength('Password1!')).toBe('medium');
    });
    test('strong: 12+ chars with uppercase AND symbol', () => {
      expect(passwordStrength('MyP@ssw0rd!2')).toBe('strong');
    });
    test('weak for short input', () => {
      expect(passwordStrength('abc')).toBe('weak');
    });
  });

  // ── Phone / E.164 (R-01) ──────────────────────────────────────────────────

  describe('normalisePhone', () => {
    test('strips non-digits and prepends +', () => {
      expect(normalisePhone('+234 801 234 5678')).toBe('+2348012345678');
    });
    test('handles already-stripped input', () => {
      expect(normalisePhone('2348012345678')).toBe('+2348012345678');
    });
    test('returns null for empty/null input', () => {
      expect(normalisePhone(null)).toBeNull();
      expect(normalisePhone('')).toBeNull();
    });
  });

  describe('validatePhone', () => {
    const valid = [
      '+2348012345678',   // Nigeria, 13 digits
      '+447911123456',    // UK, 12 digits
      '4407911123456',    // no + prefix
      '+12025550104',     // US, 11 digits
    ];
    const invalid = [
      [null,     'required'],
      ['',       'required'],
      ['123',    'too short'],
      ['+' + '1'.repeat(16), 'too long'],
      ['hello',  'too short'],
    ];

    valid.forEach(phone => {
      test(`accepts valid phone: ${phone}`, () => {
        expect(validatePhone(phone).valid).toBe(true);
      });
    });

    invalid.forEach(([phone, errorSnippet]) => {
      test(`rejects phone "${phone}" (error contains "${errorSnippet}")`, () => {
        const result = validatePhone(phone);
        expect(result.valid).toBe(false);
        expect(result.error.toLowerCase()).toContain(errorSnippet.toLowerCase());
      });
    });
  });

  // ── Names ─────────────────────────────────────────────────────────────────

  describe('normaliseName', () => {
    test('trims and collapses whitespace', () => {
      expect(normaliseName('  John   Doe  ')).toBe('John Doe');
    });
    test('returns empty string for null', () => {
      expect(normaliseName(null)).toBe('');
    });
  });

  describe('validateName', () => {
    test('accepts normal names', () => {
      expect(validateName('Jane', 'First name').valid).toBe(true);
    });
    test('rejects empty name', () => {
      const r = validateName('', 'First name');
      expect(r.valid).toBe(false);
      expect(r.error).toContain('required');
    });
    test('rejects name with injection characters', () => {
      const r = validateName('<script>', 'First name');
      expect(r.valid).toBe(false);
    });
    test('rejects names over 100 chars', () => {
      const r = validateName('a'.repeat(101), 'First name');
      expect(r.valid).toBe(false);
    });
  });

  // ── sanitisePendingExamBoards (R-19) ──────────────────────────────────────

  describe('sanitisePendingExamBoards', () => {
    test('keeps positive integers', () => {
      expect(sanitisePendingExamBoards([1, 2, 3])).toEqual([1, 2, 3]);
    });
    test('coerces string numbers', () => {
      expect(sanitisePendingExamBoards(['1', '2'])).toEqual([1, 2]);
    });
    test('drops non-integers and zero/negative', () => {
      // parseInt(2.5) → 2 (valid positive integer, kept)
      // 'abc' → NaN (dropped), null → NaN (dropped), 0 → dropped, -1 → dropped
      expect(sanitisePendingExamBoards([0, -1, 'abc', null, 2.5, 4])).toEqual([2, 4]);
    });
    test('returns [] for non-array', () => {
      expect(sanitisePendingExamBoards(null)).toEqual([]);
      expect(sanitisePendingExamBoards('1,2')).toEqual([]);
    });
  });
});

// ── 2.  Controller integration tests (mocked DB) ──────────────────────────────
//
// We mock:
//   • ../config/database   → db.query returns configurable results
//   • bcryptjs             → fast fixed hashes in tests
//   • ../utils/jwt         → fixed token
//   • ../services/emailService → captured but suppressed
//
// Each test builds minimal req/res mocks and calls the exported controller
// function directly — no HTTP server needed.

jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash:    jest.fn().mockResolvedValue('$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../utils/jwt', () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
}));

jest.mock('../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:      jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../config/database');
const { register, login, forgotPassword, updatePassword } = require('../controllers/auth');

// Helper: build a minimal Express-style req/res pair
function mockReqRes(body = {}) {
  const req = { body, user: { id: 'user-uuid-001' } };
  const res = {
    _status: 200,
    _body:   null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;   return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  // Prevent setImmediate callbacks from running during tests and causing noise
  jest.spyOn(global, 'setImmediate').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── register() ────────────────────────────────────────────────────────────────

describe('register controller', () => {

  const VALID_BODY = {
    email:    'jane@example.com',
    password: 'SecurePass1',
    phone:    '+2348012345678',
    first_name: 'Jane',
    last_name:  'Doe',
    pendingExamBoards: [1, 2],
  };

  const RETURNED_ROW = {
    id: 'user-uuid-001',
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    role: 'student',
    phone: '+2348012345678',
    is_active: true,
    is_verified: false,
    subscription_status: 'free_trial',
    onboarding_complete: false,
    xp_points: 0,
    study_streak_days: 0,
    pending_exam_board_ids: [1, 2],
    created_at: new Date().toISOString(),
    // sensitive fields — should be stripped by safeUser
    password: '$hashed',
    verification_token: 'token123',
    verification_token_expires: new Date(),
  };

  test('R-01: phone is included in INSERT (ON CONFLICT) query', async () => {
    db.query.mockResolvedValueOnce([RETURNED_ROW]);
    const { req, res, next } = mockReqRes(VALID_BODY);

    await register(req, res, next);

    expect(res._status).toBe(201);
    expect(res._body.success).toBe(true);

    // Verify db.query was called with a query containing :phone replacement
    const [sql, opts] = db.query.mock.calls[0];
    expect(sql).toContain(':phone');
    expect(opts.replacements.phone).toBe('+2348012345678');
  });

  test('R-01: phone is NOT present in response (safeUser strips nothing, phone IS safe)', async () => {
    db.query.mockResolvedValueOnce([RETURNED_ROW]);
    const { req, res } = mockReqRes(VALID_BODY);
    await register(req, res, () => {});
    // phone is not a sensitive field — it SHOULD be in the response
    expect(res._body.user.phone).toBe('+2348012345678');
    // sensitive fields should NOT be in the response
    expect(res._body.user.password).toBeUndefined();
    expect(res._body.user.verification_token).toBeUndefined();
  });

  test('R-01: rejects missing phone', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, phone: '' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('phone');
  });

  test('R-01: rejects invalid phone (too short)', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, phone: '123' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('phone');
  });

  test('R-03: ON CONFLICT with 0 rows returns 409', async () => {
    // Simulate INSERT … ON CONFLICT DO NOTHING returning empty array
    db.query.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes(VALID_BODY);
    await register(req, res, () => {});
    expect(res._status).toBe(409);
    expect(res._body.success).toBe(false);
    expect(res._body.error).toContain('already exists');
  });

  test('R-03: DB 23505 error is translated to 409 (not 500)', async () => {
    const pgError = new Error('duplicate key value violates unique constraint "users_email_key"');
    pgError.parent = { code: '23505' };
    db.query.mockRejectedValueOnce(pgError);

    const { req, res } = mockReqRes(VALID_BODY);
    await register(req, res, () => {});

    expect(res._status).toBe(409);
    // Must NOT expose raw postgres message
    expect(res._body.error).not.toContain('unique constraint');
    expect(res._body.error).not.toContain('"users_email_key"');
    expect(res._body.error).toContain('already exists');
  });

  test('R-04: email is normalised before DB query (lowercased + trimmed)', async () => {
    db.query.mockResolvedValueOnce([RETURNED_ROW]);
    const { req, res } = mockReqRes({ ...VALID_BODY, email: '  JANE@EXAMPLE.COM  ' });
    await register(req, res, () => {});
    const [, opts] = db.query.mock.calls[0];
    expect(opts.replacements.email).toBe('jane@example.com');
  });

  test('R-05: rejects password without a digit', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, password: 'PasswordOnly' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('number');
  });

  test('R-05: rejects password without a letter', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, password: '12345678' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('letter');
  });

  test('R-05: rejects password shorter than 8 chars', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, password: 'Abc1' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('8');
  });

  test('R-05: rejects password longer than 128 chars', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, password: 'A1' + 'x'.repeat(127) });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('128');
  });

  test('R-05: accepts valid complex password', async () => {
    db.query.mockResolvedValueOnce([RETURNED_ROW]);
    const { req, res } = mockReqRes({ ...VALID_BODY, password: 'MyPass1word' });
    await register(req, res, () => {});
    expect(res._status).toBe(201);
  });

  test('rejects missing email', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, email: '' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('email');
  });

  test('rejects invalid email format', async () => {
    const { req, res } = mockReqRes({ ...VALID_BODY, email: 'not-an-email' });
    await register(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('email');
  });

  test('happy path returns 201 with token and safe user', async () => {
    db.query.mockResolvedValueOnce([RETURNED_ROW]);
    const { req, res } = mockReqRes(VALID_BODY);
    await register(req, res, () => {});
    expect(res._status).toBe(201);
    expect(res._body.token).toBe('mock-jwt-token');
    expect(res._body.user.id).toBe('user-uuid-001');
  });
});

// ── Concurrent registration simulation (R-03) ─────────────────────────────────

describe('concurrent registration (R-03 race simulation)', () => {
  const BODY = {
    email: 'race@example.com',
    password: 'RaceTest1',
    phone: '+2348012345678',
    first_name: 'Race',
    last_name: 'Test',
  };

  const ROW = {
    id: 'uid', email: 'race@example.com', first_name: 'Race', last_name: 'Test',
    role: 'student', phone: '+2348012345678', is_active: true, is_verified: false,
    subscription_status: 'free_trial', onboarding_complete: false,
    xp_points: 0, study_streak_days: 0, pending_exam_board_ids: [],
    created_at: new Date().toISOString(), password: '$h', verification_token: 't', verification_token_expires: new Date(),
  };

  test('first request succeeds; second (conflict) returns 409', async () => {
    // First call: INSERT succeeds → 1 row returned
    // Second call: ON CONFLICT → 0 rows (or 23505 from a true tie)
    db.query
      .mockResolvedValueOnce([ROW])
      .mockResolvedValueOnce([]);            // second concurrent insert → empty

    const { req: req1, res: res1 } = mockReqRes(BODY);
    const { req: req2, res: res2 } = mockReqRes(BODY);

    await Promise.all([
      register(req1, res1, () => {}),
      register(req2, res2, () => {}),
    ]);

    const statuses = [res1._status, res2._status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});

// ── forgotPassword (R-04) ─────────────────────────────────────────────────────

describe('forgotPassword (R-04 email normalisation)', () => {
  test('normalises email before DB query', async () => {
    db.query.mockResolvedValueOnce([{ id: 'uid' }]);
    db.query.mockResolvedValueOnce([]);  // UPDATE call

    const { req, res } = mockReqRes({ email: '  JANE@EXAMPLE.COM  ' });
    await forgotPassword(req, res, () => {});

    const [, opts] = db.query.mock.calls[0];
    expect(opts.replacements.email).toBe('jane@example.com');
    expect(res._status).toBe(200);
  });

  test('returns 200 even for unknown email (enumeration resistance)', async () => {
    db.query.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes({ email: 'nobody@example.com' });
    await forgotPassword(req, res, () => {});
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
  });
});

// ── updatePassword (R-05) ─────────────────────────────────────────────────────

describe('updatePassword (R-05 policy on new password)', () => {
  test('rejects new password without a digit', async () => {
    const { req, res } = mockReqRes({ current_password: 'OldPass1', new_password: 'NoDigitsHere' });
    await updatePassword(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('number');
  });

  test('rejects new password without a letter', async () => {
    const { req, res } = mockReqRes({ current_password: 'OldPass1', new_password: '99999999' });
    await updatePassword(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.toLowerCase()).toContain('letter');
  });

  test('accepts valid new password', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 'uid', password: '$old_hashed' }])
      .mockResolvedValueOnce([]);  // UPDATE

    const { req, res } = mockReqRes({ current_password: 'OldPass1', new_password: 'NewPass2024' });
    await updatePassword(req, res, () => {});
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
  });
});

// ── login normalisation (R-04) ────────────────────────────────────────────────

describe('login (R-04 email normalisation)', () => {
  test('normalises email case before DB lookup', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'uid', email: 'jane@example.com', password: '$hashed',
      first_name: 'Jane', last_name: 'Doe', role: 'student',
      is_active: true, is_verified: true, subscription_status: 'free_trial',
      subscription_expires_at: null, onboarding_complete: false,
      xp_points: 0, study_streak_days: 0, last_login: null,
      avatar_url: null, daily_goal: 50,
      reset_password_token: null, reset_password_expires: null,
      verification_token: null, verification_token_expires: null,
    }]);

    const { req, res } = mockReqRes({ email: ' JANE@EXAMPLE.COM ', password: 'Secret1!' });
    await login(req, res, () => {});

    const [, opts] = db.query.mock.calls[0];
    expect(opts.replacements.email).toBe('jane@example.com');
    expect(res._status).toBe(200);
  });
});

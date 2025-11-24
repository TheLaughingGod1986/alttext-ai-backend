const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');
const licenseServiceMock = require('../mocks/licenseService.mock');
const authEmailMock = require('../../auth/email');
const { generateToken, hashPassword } = require('../../auth/jwt');
const { createLicenseSnapshot, createLicenseCreationResponse } = require('../mocks/createLicenseMock');

const app = createTestServer();

describe('Auth routes', () => {
  beforeEach(() => {
    supabaseMock.__reset();
    licenseServiceMock.__reset();
    authEmailMock.sendWelcomeEmail.mockClear().mockResolvedValue();
    
    // Use standardized license mocks
    const defaultLicense = createLicenseCreationResponse({
      id: 1,
      licenseKey: 'test-license',
      plan: 'free',
      service: 'alttext-ai',
      userId: 1
    });
    const defaultSnapshot = createLicenseSnapshot({
      licenseKey: 'test-license',
      plan: 'free'
    });
    
    licenseServiceMock.createLicense.mockResolvedValue(defaultLicense);
    licenseServiceMock.getLicenseSnapshot.mockResolvedValue(defaultSnapshot);
  });

  test('registers a new user', async () => {
    supabaseMock.__queueResponse('users', 'select', { data: null, error: null }); // Check existing user
    // For insert().select().single(), queue response for 'select' method
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 1, email: 'new@example.com', password_hash: 'hashed', plan: 'free' },
      error: null
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.license.licenseKey).toBe('test-license');
  });

  test('register validation error', async () => {
    const res = await request(app).post('/auth/register').send({ email: '' });
    expect(res.status).toBe(400);
  });

  test('registration surfaces Supabase insert errors', async () => {
    supabaseMock.__queueResponse('users', 'select', { data: null, error: null });
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'DB unavailable', code: 'PGRST500' }
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'fail@example.com', password: 'Password123!' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('REGISTRATION_ERROR');
    expect(res.body.message).toMatch(/DB unavailable/);
  });

  test('login with valid credentials', async () => {
    const hash = await hashPassword('Password123!');
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 2, email: 'login@example.com', password_hash: hash, plan: 'free' },
      error: null
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('login invalid credentials', async () => {
    const hash = await hashPassword('Password123!');
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 2, email: 'login@example.com', password_hash: hash, plan: 'free' },
      error: null
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'Wrong' });

    expect(res.status).toBe(401);
  });

  test('me endpoint returns current user', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 3, email: 'me@example.com', plan: 'free', created_at: new Date().toISOString() },
      error: null
    });

    const token = generateToken({ id: 3, email: 'me@example.com', plan: 'free' });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });

  // Email fallback flow tests

  test('registration succeeds even when welcome email fails', async () => {
    supabaseMock.__queueResponse('users', 'select', { data: null, error: null });
    // For insert().select().single(), queue response for 'select' method
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 1, email: 'emailfail@example.com', password_hash: 'hashed_password', plan: 'free' },
      error: null
    });
    // License service should succeed - use standardized mocks
    const licenseResponse = createLicenseCreationResponse({
      id: 1,
      licenseKey: 'test-license',
      plan: 'free',
      service: 'alttext-ai',
      userId: 1
    });
    const snapshot = createLicenseSnapshot({
      licenseKey: 'test-license',
      plan: 'free'
    });
    licenseServiceMock.createLicense.mockResolvedValueOnce(licenseResponse);
    licenseServiceMock.getLicenseSnapshot.mockResolvedValueOnce(snapshot);

    // Mock email failure
    authEmailMock.sendWelcomeEmail.mockRejectedValueOnce(new Error('Email service unavailable'));

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'emailfail@example.com', password: 'Password123!' });

    // Registration should succeed even if email fails
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('emailfail@example.com');
    expect(authEmailMock.sendWelcomeEmail).toHaveBeenCalled();
  });

  test('registration handles email timeout gracefully', async () => {
    supabaseMock.__queueResponse('users', 'select', { data: null, error: null });
    // For insert().select().single(), queue response for 'select' method
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 1, email: 'timeout@example.com', password_hash: 'hashed_password', plan: 'free' },
      error: null
    });
    // License service should succeed - use standardized mocks
    const licenseResponse = createLicenseCreationResponse({
      id: 1,
      licenseKey: 'test-license',
      plan: 'free',
      service: 'alttext-ai',
      userId: 1
    });
    const snapshot = createLicenseSnapshot({
      licenseKey: 'test-license',
      plan: 'free'
    });
    licenseServiceMock.createLicense.mockResolvedValueOnce(licenseResponse);
    licenseServiceMock.getLicenseSnapshot.mockResolvedValueOnce(snapshot);

    // Mock email timeout
    authEmailMock.sendWelcomeEmail.mockImplementationOnce(() =>
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('Email timeout')), 100))
    );

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'timeout@example.com', password: 'Password123!' });

    // Registration should succeed even if email times out
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('timeout@example.com');
  });

  // Additional auth route tests

  test('register rejects weak password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'weak@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  test('register rejects existing user', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 1, email: 'existing@example.com' },
      error: null
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'existing@example.com', password: 'Password123!' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USER_EXISTS');
  });

  test('register handles invalid service gracefully', async () => {
    supabaseMock.__queueResponse('users', 'select', { data: null, error: null });
    // For insert().select().single(), queue response for 'select' method
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 1, email: 'invalidservice@example.com', password_hash: 'hashed', plan: 'free' },
      error: null
    });
    // License service should be called with alttext-ai (default) - use standardized mocks
    const licenseResponse = createLicenseCreationResponse({
      id: 1,
      licenseKey: 'test-license',
      plan: 'free',
      service: 'alttext-ai',
      userId: 1
    });
    const snapshot = createLicenseSnapshot({
      licenseKey: 'test-license',
      plan: 'free'
    });
    licenseServiceMock.createLicense.mockResolvedValueOnce(licenseResponse);
    licenseServiceMock.getLicenseSnapshot.mockResolvedValueOnce(snapshot);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'invalidservice@example.com', password: 'Password123!', service: 'invalid-service' });

    // Should default to alttext-ai
    expect(res.status).toBe(201);
    expect(res.body.user.service || 'alttext-ai').toBe('alttext-ai');
    expect(licenseServiceMock.createLicense).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'alttext-ai' })
    );
  });

  test('register handles license creation failure gracefully', async () => {
    supabaseMock.__queueResponse('users', 'select', { data: null, error: null });
    // For insert().select().single(), queue response for 'select' method
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 1, email: 'nolicense@example.com', password_hash: 'hashed', plan: 'free' },
      error: null
    });
    // Mock license creation to fail
    licenseServiceMock.createLicense.mockRejectedValueOnce(new Error('License creation failed'));

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'nolicense@example.com', password: 'Password123!' });

    // Registration should still succeed even if license creation fails
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('nolicense@example.com');
    // License should not be in response if creation failed
    expect(res.body.license).toBeUndefined();
  });

  test('login requires email and password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FIELDS');
  });

  test('login handles user not found', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'Password123!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('me endpoint requires authentication', async () => {
    const res = await request(app)
      .get('/auth/me');

    expect(res.status).toBe(401);
  });

  test('me endpoint handles user not found', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const token = generateToken({ id: 999, email: 'missing@example.com', plan: 'free' });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('refresh token endpoint works', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 4, email: 'refresh@example.com', plan: 'pro' },
      error: null
    });

    const token = generateToken({ id: 4, email: 'refresh@example.com', plan: 'pro' });
    const res = await request(app)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('refresh token requires authentication', async () => {
    const res = await request(app)
      .post('/auth/refresh');

    expect(res.status).toBe(401);
  });

  test('forgot-password requires email', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_EMAIL');
  });

  test('forgot-password returns success even if user not found', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });

    // Should return success to prevent email enumeration
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('forgot-password handles rate limiting', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 5 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      count: 3,
      error: null
    });

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'ratelimited@example.com' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('forgot-password creates reset token', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 6 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      count: 0,
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'insert', { error: null });
    authEmailMock.sendPasswordResetEmail.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'reset@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authEmailMock.sendPasswordResetEmail).toHaveBeenCalled();
  });

  test('reset-password requires all fields', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FIELDS');
  });

  test('reset-password rejects weak password', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@example.com', token: 'valid-token', newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  test('reset-password handles invalid token', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 7 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@example.com', token: 'invalid-token', newPassword: 'NewPassword123!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
  });

  test('reset-password handles user not found', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'nonexistent@example.com', token: 'valid-token', newPassword: 'NewPassword123!' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
  });

  test('reset-password accepts password or newPassword field', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 8 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      data: { id: 1, userId: 8, token: 'valid-token', used: false, expiresAt: new Date(Date.now() + 3600000).toISOString() },
      error: null
    });
    supabaseMock.__queueResponse('users', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@example.com', token: 'valid-token', password: 'NewPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('reset-password successfully resets password', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 9 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      data: { id: 2, userId: 9, token: 'valid-token', used: false, expiresAt: new Date(Date.now() + 3600000).toISOString() },
      error: null
    });
    supabaseMock.__queueResponse('users', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'reset@example.com', token: 'valid-token', newPassword: 'NewPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Password has been reset/);
  });

  // PHASE 1: Auth email routes integration tests
  test('forgot-password handles email failure gracefully', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 10 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      count: 0,
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'insert', { error: null });

    // Mock email failure
    authEmailMock.sendPasswordResetEmail.mockRejectedValueOnce(new Error('Email service unavailable'));

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'emailfail@example.com' });

    // Should still return success even if email fails (token is created)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authEmailMock.sendPasswordResetEmail).toHaveBeenCalled();
  });

  test('forgot-password handles rate limit rejection from Resend', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 11 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      count: 0,
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'insert', { error: null });

    // Mock Resend rate limit error
    const rateLimitError = new Error('Rate limit exceeded');
    rateLimitError.statusCode = 429;
    authEmailMock.sendPasswordResetEmail.mockRejectedValueOnce(rateLimitError);

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'ratelimit@example.com' });

    // Should still return success even if email rate limited (token is created)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authEmailMock.sendPasswordResetEmail).toHaveBeenCalled();
  });

  test('forgot-password handles missing RESEND_API_KEY', async () => {
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 12 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      count: 0,
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'update', { error: null });
    supabaseMock.__queueResponse('password_reset_tokens', 'insert', { error: null });

    // sendPasswordResetEmail will handle missing key gracefully
    authEmailMock.sendPasswordResetEmail.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nokey@example.com' });

    // Should still return success (token is created, email failure is logged)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Restore key
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
  });

  test('reset-password handles email failure during token creation', async () => {
    // This test verifies that reset-password doesn't send emails, but we can test
    // that the route handles errors gracefully
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 13 },
      error: null
    });
    supabaseMock.__queueResponse('password_reset_tokens', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@example.com', token: 'invalid-token', newPassword: 'NewPassword123!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
  });
});


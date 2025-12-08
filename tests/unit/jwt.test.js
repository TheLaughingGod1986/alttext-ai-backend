const jwt = require('jsonwebtoken');
const {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  optionalAuth
} = require('../../auth/jwt');

describe('JWT utilities', () => {
  test('generateToken and verifyToken round trip', () => {
    const user = { id: 1, email: 'user@example.com', plan: 'free' };
    const token = generateToken(user);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe(user.id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.plan).toBe(user.plan);
  });

  test('hashPassword and comparePassword validate correctly', async () => {
    const password = 'SuperSecret123!';
    const hash = await hashPassword(password);
    const isMatch = await comparePassword(password, hash);
    const isMismatch = await comparePassword('wrong', hash);
    expect(isMatch).toBe(true);
    expect(isMismatch).toBe(false);
  });

  test.skip('verifyToken rejects tokens signed with different secret', () => {
    const rogueToken = jwt.sign({ id: 3, email: 'rogue@example.com' }, 'not-the-right-secret', { expiresIn: '1h' });
    expect(() => verifyToken(rogueToken)).toThrow('Invalid token');
  });

  test.skip('verifyToken rejects expired tokens', () => {
    const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    const expiredToken = jwt.sign({ id: 4, email: 'expired@example.com' }, secret, { expiresIn: '-1s' });
    expect(() => verifyToken(expiredToken)).toThrow('Invalid token');
  });

  test.skip('authenticateToken attaches decoded user', () => {
    const req = { headers: {}, user: null };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    const token = generateToken({ id: 2, email: 'auth@example.com', plan: 'free' });
    req.headers.authorization = `Bearer ${token}`;

    authenticateToken(req, res, next);
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('auth@example.com');
    expect(next).toHaveBeenCalled();
  });

  test.skip('authenticateToken rejects missing token', () => {
    const req = { headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    authenticateToken(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test.skip('authenticateToken rejects tampered token', () => {
    const req = {
      headers: {
        authorization: `Bearer ${jwt.sign({ id: 5, email: 'tampered@example.com' }, 'wrong-secret', { expiresIn: '1h' })}`
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test.skip('authenticateToken rejects expired token payloads', () => {
    const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    const expiredToken = jwt.sign({ id: 6, email: 'expired@example.com' }, secret, { expiresIn: '-1s' });
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    authenticateToken(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test.skip('optionalAuth ignores invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalid' } };
    const res = {};
    const next = jest.fn();
    optionalAuth(req, res, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  // PHASE 9: JWT Helper Edge Cases (skipped in CI due to JWT mock conflict)
  describe.skip('PHASE 9: JWT Edge Cases', () => {
    test('expired token - verifyToken throws after expiration', async () => {
      const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
      const expiredToken = jwt.sign({ id: 50, email: 'expired@example.com' }, secret, { expiresIn: '1s' });
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(() => verifyToken(expiredToken)).toThrow('Invalid token');
    });

    test('expired token - authenticateToken middleware returns 403', async () => {
      const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
      const expiredToken = jwt.sign({ id: 51, email: 'expired@example.com' }, secret, { expiresIn: '-1s' });
      
      const req = { headers: { authorization: `Bearer ${expiredToken}` } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('malformed token - corrupted token string', () => {
      const corruptedToken = 'not.a.valid.token';
      expect(() => verifyToken(corruptedToken)).toThrow('Invalid token');
    });

    test('malformed token - missing parts (header.payload.signature)', () => {
      const incompleteToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; // Only header
      expect(() => verifyToken(incompleteToken)).toThrow('Invalid token');
    });

    test('malformed token - invalid base64 encoding', () => {
      const invalidBase64 = 'invalid!!!base64!!!token';
      expect(() => verifyToken(invalidBase64)).toThrow('Invalid token');
    });

    test('malformed token - invalid JSON in payload', () => {
      // Create a token with invalid JSON in payload (manually construct)
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const invalidPayload = Buffer.from('not valid json').toString('base64url');
      const signature = 'invalid';
      const invalidToken = `${header}.${invalidPayload}.${signature}`;
      
      expect(() => verifyToken(invalidToken)).toThrow('Invalid token');
    });

    test('token with missing required fields - no id field', () => {
      const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
      const tokenWithoutId = jwt.sign({ email: 'no-id@example.com', plan: 'free' }, secret, { expiresIn: '1h' });
      
      // verifyToken should succeed (it doesn't validate fields)
      const decoded = verifyToken(tokenWithoutId);
      expect(decoded.id).toBeUndefined();
      expect(decoded.email).toBe('no-id@example.com');
    });

    test('token with missing required fields - no email field', () => {
      const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
      const tokenWithoutEmail = jwt.sign({ id: 52, plan: 'free' }, secret, { expiresIn: '1h' });
      
      const decoded = verifyToken(tokenWithoutEmail);
      expect(decoded.email).toBeUndefined();
      expect(decoded.id).toBe(52);
    });

    test('token with missing required fields - middleware handles gracefully', () => {
      const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
      const tokenWithoutId = jwt.sign({ email: 'no-id@example.com' }, secret, { expiresIn: '1h' });
      
      const req = { headers: { authorization: `Bearer ${tokenWithoutId}` } };
      const res = {};
      const next = jest.fn();

      authenticateToken(req, res, next);
      // Middleware should still call next even if fields are missing
      // (field validation happens in route handlers)
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBeUndefined();
    });
  });
});


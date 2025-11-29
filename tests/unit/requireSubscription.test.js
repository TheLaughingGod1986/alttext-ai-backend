/**
 * Unit tests for requireSubscription middleware
 */

const requireSubscription = require('../../src/middleware/requireSubscription');
const accessControlService = require('../../src/services/accessControlService');
const errorCodes = require('../../src/constants/errorCodes');

// Mock dependencies
jest.mock('../../src/services/accessControlService');

describe('requireSubscription middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: {
        email: 'test@example.com',
      },
      path: '/api/generate',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  it('should return 401 when token is missing', async () => {
    req.user = null;

    await requireSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      code: errorCodes.NO_ACCESS,
      reason: errorCodes.REASONS.NO_IDENTITY,
      message: 'Authentication required.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when email is missing from token', async () => {
    req.user = {};

    await requireSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      code: errorCodes.NO_ACCESS,
      reason: errorCodes.REASONS.NO_IDENTITY,
      message: 'Authentication required.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for inactive subscription', async () => {
    accessControlService.evaluateAccess.mockResolvedValue({
      allowed: false,
      code: errorCodes.NO_ACCESS,
      reason: errorCodes.REASONS.SUBSCRIPTION_INACTIVE,
      message: 'Your subscription is inactive. Please renew to continue.',
    });

    await requireSubscription(req, res, next);

    expect(accessControlService.evaluateAccess).toHaveBeenCalledWith('test@example.com', '/api/generate');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      code: errorCodes.NO_ACCESS,
      reason: errorCodes.REASONS.SUBSCRIPTION_INACTIVE,
      message: 'Your subscription is inactive. Please renew to continue.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for free plan with no credits', async () => {
    accessControlService.evaluateAccess.mockResolvedValue({
      allowed: false,
      code: errorCodes.NO_ACCESS,
      reason: errorCodes.REASONS.NO_CREDITS,
      message: 'You have no credits remaining. Please purchase credits or subscribe.',
    });

    await requireSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      code: errorCodes.NO_ACCESS,
      reason: errorCodes.REASONS.NO_CREDITS,
      message: 'You have no credits remaining. Please purchase credits or subscribe.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when access is allowed', async () => {
    accessControlService.evaluateAccess.mockResolvedValue({
      allowed: true,
    });

    await requireSubscription(req, res, next);

    expect(accessControlService.evaluateAccess).toHaveBeenCalledWith('test@example.com', '/api/generate');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should return 500 on unexpected errors', async () => {
    accessControlService.evaluateAccess.mockRejectedValue(new Error('Unexpected error'));

    await requireSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      code: 'SERVER_ERROR',
      message: 'Unexpected error.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle missing code in deny result', async () => {
    accessControlService.evaluateAccess.mockResolvedValue({
      allowed: false,
      reason: errorCodes.REASONS.NO_CREDITS,
      message: 'Custom message',
    });

    await requireSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      code: errorCodes.NO_ACCESS, // Should default to NO_ACCESS
      reason: errorCodes.REASONS.NO_CREDITS,
      message: 'Custom message',
    });
  });
});


/**
 * Integration tests for waitlist routes
 */

const request = require('supertest');
const { createTestServer, resetTestState } = require('../helpers/createTestServer');
const emailService = require('../../src/services/emailService');
const { supabase } = require('../../db/supabase-client');

// Mock emailService
jest.mock('../../src/services/emailService', () => ({
  sendWaitlistWelcome: jest.fn(),
}));

// Mock Supabase
jest.mock('../../db/supabase-client', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
    })),
  },
}));

describe('POST /waitlist/submit', () => {
  let app;

  beforeEach(() => {
    app = createTestServer();
    resetTestState();
    jest.clearAllMocks();

    // Default successful email service mock
    emailService.sendWaitlistWelcome.mockResolvedValue({
      success: true,
      emailId: 'test-email-id',
    });

    // Default successful Supabase mock
    const mockInsert = {
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 1,
            email: 'test@example.com',
            plugin: null,
            source: 'website',
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      })),
    };

    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue(mockInsert),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('successful signup', () => {
    it('should accept valid email and return success', async () => {
      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        message: 'Successfully added to waitlist',
        emailSent: true,
      });

      expect(emailService.sendWaitlistWelcome).toHaveBeenCalledWith({
        email: 'test@example.com',
        plugin: undefined,
        source: 'website',
      });
    });

    it('should accept email with plugin and source', async () => {
      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'test@example.com',
          plugin: 'wordpress',
          source: 'plugin',
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(emailService.sendWaitlistWelcome).toHaveBeenCalledWith({
        email: 'test@example.com',
        plugin: 'wordpress',
        source: 'plugin',
      });
    });

    it('should handle Supabase insert failure gracefully', async () => {
      // Mock Supabase error (e.g., table doesn't exist)
      supabase.from.mockReturnValue({
        insert: jest.fn().mockImplementation(() => {
          throw new Error('Table does not exist');
        }),
      });

      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      // Should still succeed if email is sent
      expect(response.body.ok).toBe(true);
      expect(emailService.sendWaitlistWelcome).toHaveBeenCalled();
    });
  });

  describe('validation errors', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/waitlist/submit')
        .send({})
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBeDefined();
      // Zod error message format may vary, just check that there's an error
      expect(typeof response.body.error).toBe('string');
      expect(emailService.sendWaitlistWelcome).not.toHaveBeenCalled();
    });

    it('should return 400 when email is invalid format', async () => {
      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'not-an-email',
        })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toContain('email');
      expect(emailService.sendWaitlistWelcome).not.toHaveBeenCalled();
    });

    it('should return 400 when email is empty string', async () => {
      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: '',
        })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(emailService.sendWaitlistWelcome).not.toHaveBeenCalled();
    });
  });

  describe('email service errors', () => {
    it('should return 500 when email service fails and no record stored', async () => {
      emailService.sendWaitlistWelcome.mockResolvedValue({
        success: false,
        error: 'Email service unavailable',
      });

      // Mock Supabase to also fail
      supabase.from.mockReturnValue({
        insert: jest.fn().mockImplementation(() => {
          throw new Error('Database error');
        }),
      });

      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'test@example.com',
        })
        .expect(500);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 200 when email fails but record was stored', async () => {
      emailService.sendWaitlistWelcome.mockResolvedValue({
        success: false,
        error: 'Email service unavailable',
      });

      // Mock successful Supabase insert
      const mockInsert = {
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 1,
              email: 'test@example.com',
            },
            error: null,
          }),
        })),
      };

      supabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue(mockInsert),
      });

      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.emailSent).toBe(false);
      expect(response.body.message).toContain('email failed');
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate email in database gracefully', async () => {
      // Mock Supabase duplicate error
      const mockInsert = {
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: {
              message: 'duplicate key value violates unique constraint',
            },
          }),
        })),
      };

      supabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue(mockInsert),
      });

      const response = await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      // Should still send email even if duplicate
      expect(response.body.ok).toBe(true);
      expect(emailService.sendWaitlistWelcome).toHaveBeenCalled();
    });

    it('should lowercase email addresses', async () => {
      await request(app)
        .post('/waitlist/submit')
        .send({
          email: 'TEST@EXAMPLE.COM',
        })
        .expect(200);

      // Verify email was lowercased in Supabase call
      const insertCall = supabase.from().insert;
      expect(insertCall).toHaveBeenCalled();
      const insertArgs = insertCall.mock.calls[0][0];
      expect(insertArgs.email).toBe('test@example.com');
    });
  });
});


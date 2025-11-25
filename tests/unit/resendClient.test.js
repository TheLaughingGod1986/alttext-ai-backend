/**
 * Unit tests for resendClient
 */

describe('resendClient', () => {
  const MODULE_PATH = '../../src/utils/resendClient';

  let mockResendInstance;
  let mockResend;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.RESEND_API_KEY;

    // Mock Resend class
    mockResendInstance = {
      emails: {
        send: jest.fn(),
      },
    };

    mockResend = {
      Resend: jest.fn().mockImplementation(() => mockResendInstance),
    };

    jest.mock('resend', () => mockResend);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('sendEmail returns error when RESEND_API_KEY not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = require(MODULE_PATH);

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Resend API key not configured');
  });

  test('sendEmail initializes Resend client when API key is set', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    mockResendInstance.emails.send.mockResolvedValue({ data: { id: 'email_123' } });

    const { sendEmail } = require(MODULE_PATH);

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(mockResend.Resend).toHaveBeenCalledWith('re_test_key');
  });

  test('sendEmail calls Resend with correct payload', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'Test <test@example.com>';
    mockResendInstance.emails.send.mockResolvedValue({ data: { id: 'email_123' } });

    const { sendEmail } = require(MODULE_PATH);

    const result = await sendEmail({
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>HTML content</p>',
      text: 'Text content',
      tags: [{ name: 'event', value: 'test' }],
    });

    expect(mockResendInstance.emails.send).toHaveBeenCalledWith({
      from: 'Test <test@example.com>',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>HTML content</p>',
      text: 'Text content',
      tags: [{ name: 'event', value: 'test' }],
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('email_123');
  });

  test('sendEmail uses default from email when not provided', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'Default <default@example.com>';
    mockResendInstance.emails.send.mockResolvedValue({ data: { id: 'email_123' } });

    const { sendEmail } = require(MODULE_PATH);

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(mockResendInstance.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Default <default@example.com>',
      })
    );
  });

  test('sendEmail uses custom from email when provided', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'Default <default@example.com>';
    mockResendInstance.emails.send.mockResolvedValue({ data: { id: 'email_123' } });

    const { sendEmail } = require(MODULE_PATH);

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      from: 'Custom <custom@example.com>',
    });

    expect(mockResendInstance.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Custom <custom@example.com>',
      })
    );
  });

  test('sendEmail returns error when required fields are missing', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { sendEmail } = require(MODULE_PATH);

    const result1 = await sendEmail({
      subject: 'Test',
      html: '<p>Test</p>',
      // Missing 'to'
    });

    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Missing required email fields');

    const result2 = await sendEmail({
      to: 'test@example.com',
      html: '<p>Test</p>',
      // Missing 'subject'
    });

    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Missing required email fields');
  });

  test('sendEmail handles Resend API errors', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const errorResponse = {
      error: {
        message: 'Rate limit exceeded',
        statusCode: 429,
      },
    };
    mockResendInstance.emails.send.mockResolvedValue(errorResponse);

    const { sendEmail } = require(MODULE_PATH);

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limit exceeded');
  });

  test('sendEmail handles exceptions', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    mockResendInstance.emails.send.mockRejectedValue(new Error('Network error'));

    const { sendEmail } = require(MODULE_PATH);

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  test('sendEmail works without text content', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    mockResendInstance.emails.send.mockResolvedValue({ data: { id: 'email_123' } });

    const { sendEmail } = require(MODULE_PATH);

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      // No text provided
    });

    expect(result.success).toBe(true);
    const callArgs = mockResendInstance.emails.send.mock.calls[0][0];
    expect(callArgs.text).toBeUndefined();
  });

  test('sendEmail works without tags', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    mockResendInstance.emails.send.mockResolvedValue({ data: { id: 'email_123' } });

    const { sendEmail } = require(MODULE_PATH);

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      // No tags provided
    });

    expect(result.success).toBe(true);
    const callArgs = mockResendInstance.emails.send.mock.calls[0][0];
    expect(callArgs.tags).toBeUndefined();
  });
});


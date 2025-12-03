const { validateEmail, validatePassword, validateDomain, sanitizeInput } = require('../../src/validation/validators');

describe('Validation utilities', () => {
  describe('validateEmail', () => {
    test('validates correct email formats', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@example.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
    });

    test('rejects invalid email formats', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('invalid@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@example')).toBe(false);
      expect(validateEmail('user example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail(undefined)).toBe(false);
    });

    test('handles whitespace in email', () => {
      expect(validateEmail(' user@example.com ')).toBe(true);
      expect(validateEmail('  user@example.com  ')).toBe(true);
    });
  });

  describe('validatePassword', () => {
    test('validates password with default requirements', () => {
      const result = validatePassword('Password123');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('rejects password shorter than minimum length', () => {
      const result = validatePassword('short');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    test('validates password with custom minimum length', () => {
      const result = validatePassword('Pass12', { minLength: 6 });
      expect(result.valid).toBe(true);
    });

    test('validates password with special character requirement', () => {
      const result = validatePassword('Password123!', { requireSpecialChars: true });
      expect(result.valid).toBe(true);
    });

    test('rejects password without special characters when required', () => {
      const result = validatePassword('Password123', { requireSpecialChars: true });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    test('handles null/undefined password', () => {
      expect(validatePassword(null).valid).toBe(false);
      expect(validatePassword(undefined).valid).toBe(false);
      expect(validatePassword('').valid).toBe(false);
    });

    test('returns multiple errors when password fails multiple checks', () => {
      const result = validatePassword('short', { requireSpecialChars: true });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateDomain', () => {
    test('validates correct domain formats', () => {
      expect(validateDomain('example.com').valid).toBe(true);
      expect(validateDomain('subdomain.example.com').valid).toBe(true);
      expect(validateDomain('test-site.example.co.uk').valid).toBe(true);
    });

    test('rejects IP addresses', () => {
      const result = validateDomain('192.168.1.1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('IP addresses are not allowed');
    });

    test('rejects invalid domain formats', () => {
      expect(validateDomain('invalid').valid).toBe(false);
      expect(validateDomain('example').valid).toBe(false);
      expect(validateDomain('example.').valid).toBe(false);
      expect(validateDomain('.example.com').valid).toBe(false);
    });

    test('handles null/undefined domain', () => {
      expect(validateDomain(null).valid).toBe(false);
      expect(validateDomain(undefined).valid).toBe(false);
      expect(validateDomain('').valid).toBe(false);
    });

    test('handles whitespace in domain', () => {
      const result = validateDomain(' example.com ');
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitizeInput', () => {
    test('removes SQL injection patterns', () => {
      expect(sanitizeInput("'; DROP TABLE users; --")).not.toContain('DROP');
      expect(sanitizeInput("admin' OR '1'='1")).not.toContain("'");
      expect(sanitizeInput('SELECT * FROM users')).not.toContain('SELECT');
    });

    test('removes XSS patterns by default', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('<script>');
      expect(sanitizeInput('<img src=x onerror=alert(1)>')).not.toContain('onerror');
      expect(sanitizeInput('<div>content</div>')).not.toContain('<div>');
    });

    test('allows HTML when allowHtml option is true', () => {
      const result = sanitizeInput('<div>content</div>', { allowHtml: true });
      expect(result).toContain('<div>');
      // But should still remove script tags
      expect(sanitizeInput('<script>alert(1)</script>', { allowHtml: true })).not.toContain('<script>');
    });

    test('removes null bytes', () => {
      expect(sanitizeInput('test\0string')).not.toContain('\0');
    });

    test('trims whitespace', () => {
      expect(sanitizeInput('  test  ')).toBe('test');
    });

    test('handles null/undefined input', () => {
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
    });

    test('preserves safe content', () => {
      const safe = 'This is safe content 123';
      expect(sanitizeInput(safe)).toBe(safe);
    });

    test('removes event handlers even when HTML is allowed', () => {
      const result = sanitizeInput('<div onclick="alert(1)">content</div>', { allowHtml: true });
      expect(result).not.toContain('onclick');
    });
  });
});


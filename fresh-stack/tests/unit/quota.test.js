const { computePeriodStart } = require('../../services/quota');

describe('computePeriodStart', () => {
  test('uses billing day within month', () => {
    const now = new Date('2025-02-10T00:00:00Z');
    const start = computePeriodStart(15, now);
    expect(start.toISOString()).toBe('2025-01-15T00:00:00.000Z');
  });

  test('caps day between 1 and 31', () => {
    const now = new Date('2025-02-10T00:00:00Z');
    const start = computePeriodStart(0, now);
    expect(start.getUTCDate()).toBe(1);
  });
});

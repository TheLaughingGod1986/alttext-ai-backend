const { authMiddleware } = require('../../middleware/auth');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('auth middleware', () => {
  test('rejects missing license and api token', async () => {
    const supabase = {};
    const mw = authMiddleware({ supabase });
    const req = { header: () => null };
    const res = createRes();
    await mw(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });
});

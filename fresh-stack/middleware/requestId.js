const crypto = require('crypto');

function requestId() {
  return function reqId(req, res, next) {
    const existing = req.headers['x-request-id'];
    const id = existing || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

module.exports = requestId;

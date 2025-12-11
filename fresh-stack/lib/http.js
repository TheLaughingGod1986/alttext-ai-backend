function sendSuccess(res, data) {
  return res.json(data);
}

function sendError(res, { status = 500, error = 'SERVER_ERROR', message = 'Internal server error', code }) {
  return res.status(status).json({
    error: error.toLowerCase(),
    message,
    code: code || error
  });
}

module.exports = {
  sendSuccess,
  sendError
};

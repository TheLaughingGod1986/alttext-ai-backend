const basicAuth = require('express-basic-auth');

const username = process.env.PROVIDER_USERNAME || 'provider';
const password = process.env.PROVIDER_PASSWORD || 'change-me';

const providerAuth = basicAuth({
  users: { [username]: password },
  challenge: true,
  unauthorizedResponse: () => 'Unauthorized',
});

module.exports = {
  providerAuth,
};

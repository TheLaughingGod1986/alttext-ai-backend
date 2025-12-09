const Redis = require('ioredis');

let client = null;

function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL || process.env.REDIS_CONNECTION;
  if (!url) return null;
  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true
  });
  client.on('error', (err) => {
    console.error('[redis] error', err.message);
  });
  client.connect().catch(err => {
    console.error('[redis] failed to connect', err.message);
  });
  return client;
}

module.exports = { getRedis };

const crypto = require('crypto');
const logger = require('./logger');

function createQueue({ redis, jobHandler, concurrency = 2, ttlSeconds = 60 * 60 * 24 * 7, queueKey = 'alttext:queue' }) {
  const jobStore = new Map();
  const jobQueue = [];
  let activeWorkers = 0;
  let redisWorkersStarted = false;

  async function setJobRecord(jobId, record) {
    record.updatedAt = new Date().toISOString();
    if (redis) {
      await redis.set(`alttext:job:${jobId}`, JSON.stringify(record), 'EX', ttlSeconds);
    } else {
      jobStore.set(jobId, record);
    }
  }

  async function getJobRecord(jobId) {
    if (redis) {
      const val = await redis.get(`alttext:job:${jobId}`);
      return val ? JSON.parse(val) : null;
    }
    return jobStore.get(jobId) || null;
  }

  async function enqueueJob(job) {
    if (redis) {
      await redis.lpush(queueKey, JSON.stringify(job));
      startRedisWorkers();
    } else {
      jobQueue.push(job);
      processQueueInMemory();
    }
  }

  async function processQueueInMemory() {
    if (activeWorkers >= concurrency) return;
    const next = jobQueue.shift();
    if (!next) return;
    activeWorkers += 1;
    try {
      await jobHandler(next);
    } finally {
      activeWorkers -= 1;
      if (jobQueue.length) processQueueInMemory();
    }
  }

  function startRedisWorkers() {
    if (redisWorkersStarted || !redis) return;
    redisWorkersStarted = true;
    for (let i = 0; i < concurrency; i += 1) {
      redisWorkerLoop();
    }
  }

  async function redisWorkerLoop() {
    while (true) {
      try {
        const res = await redis.brpop(queueKey, 5);
        if (!res) continue;
        const [, payload] = res;
        const job = JSON.parse(payload);
        await jobHandler(job);
      } catch (err) {
        logger.error('[jobs] worker error', err.message);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  async function createJob(items, context, siteKey) {
    const jobId = crypto.randomUUID();
    const jobRecord = {
      status: 'queued',
      results: [],
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setJobRecord(jobId, jobRecord);
    await enqueueJob({ jobId, items, context, siteKey });
    return jobId;
  }

  return {
    createJob,
    getJobRecord,
    setJobRecord,
    startRedisWorkers
  };
}

module.exports = { createQueue };

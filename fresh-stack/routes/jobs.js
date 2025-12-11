const express = require('express');
const { z } = require('zod');

const batchSchema = z.object({
  images: z.array(z.object({
    image: z.any(), // validation handled upstream via altText schema reuse
    context: z.any().optional()
  })).min(1),
  context: z.any().optional()
});

function createJobsRouter({ supabase, checkRateLimit, getSiteFromHeaders, createJob, getJobRecord }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const siteKey = req.header('X-Site-Key') || 'default';

    // Get site data and check quota
    const siteData = await getSiteFromHeaders(supabase, req);
    if (siteData.remaining <= 0) {
      return res.status(402).json({
        error: 'Quota exceeded for this billing period',
        code: 'QUOTA_EXCEEDED',
        quota: siteData.quota,
        used: siteData.used,
        remaining: 0,
        plan: siteData.plan
      });
    }

    // Check if batch size would exceed quota
    const { images } = parsed.data;
    if (siteData.remaining < images.length) {
      return res.status(402).json({
        error: `Batch size (${images.length} images) exceeds remaining quota (${siteData.remaining} images)`,
        code: 'BATCH_EXCEEDS_QUOTA',
        quota: siteData.quota,
        used: siteData.used,
        remaining: siteData.remaining,
        plan: siteData.plan,
        batchSize: images.length
      });
    }

    if (!(await checkRateLimit(siteKey))) {
      return res.status(429).json({ error: 'Rate limit exceeded for this site. Please retry later.' });
    }

    const { context = {} } = parsed.data;
    const items = images.map(item => ({ image: item.image, context: item.context || {} }));
    const jobId = await createJob(items, context, siteKey);
    res.json({ jobId, status: 'queued' });
  });

  router.get('/:jobId', async (req, res) => {
    const job = await getJobRecord(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  return router;
}

module.exports = { createJobsRouter };

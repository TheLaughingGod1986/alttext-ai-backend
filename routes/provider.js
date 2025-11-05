const express = require('express');
const path = require('path');
const { providerAuth } = require('../auth/provider');
const { listInstallations, fetchSummary, fetchEvents } = require('../services/providerUsageService');

const router = express.Router();

router.get('/dashboard', providerAuth, async (req, res, next) => {
  try {
    const { data, meta } = await listInstallations({ limit: 50, offset: 0 });
    const totals = data.reduce((acc, item) => {
      acc.tokens += item.tokens30d;
      acc.costMicros += item.costMicros;
      acc.revenueCents += item.revenueCents;
      return acc;
    }, { tokens: 0, costMicros: 0, revenueCents: 0 });

    res.render('provider/dashboard', {
      installations: data,
      meta,
      totals: {
        tokens: totals.tokens,
        costUsd: (totals.costMicros / 1_000_000).toFixed(4),
        revenue: (totals.revenueCents / 100).toFixed(2),
        profit: ((totals.revenueCents / 100) - (totals.costMicros / 1_000_000)).toFixed(2),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/usage/installations', providerAuth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await listInstallations({ limit, offset });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/usage/summary', providerAuth, async (req, res, next) => {
  try {
    const data = await fetchSummary({
      installId: req.query.install_id,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      groupBy: req.query.group_by,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/usage/events', providerAuth, async (req, res, next) => {
  try {
    const data = await fetchEvents({
      installId: req.query.install_id,
      userHash: req.query.user_hash,
      source: req.query.source,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

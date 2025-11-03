const crypto = require('crypto');
const dayjs = require('dayjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_COST_PER_1K_TOKENS = parseFloat(process.env.DEFAULT_COST_PER_1K_TOKENS || '0.0025');
const MODEL_COST_OVERRIDES = safeParseJSON(process.env.MODEL_COST_OVERRIDES) || {};
const PLAN_PRICES = {
  free: parseFloat(process.env.PLAN_FREE_MONTHLY || '0'),
  pro: parseFloat(process.env.PLAN_PRO_MONTHLY || '12.99'),
  agency: parseFloat(process.env.PLAN_AGENCY_MONTHLY || '49.99'),
};
const ALLOW_FIRST_SYNC_WITHOUT_SIGNATURE = (process.env.ALLOW_FIRST_SYNC_WITHOUT_SIGNATURE || 'true').toLowerCase() !== 'false';

function safeParseJSON(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[usage] Failed to parse MODEL_COST_OVERRIDES JSON');
    return null;
  }
}

function calculateCostMicros(model, totalTokens) {
  const override = MODEL_COST_OVERRIDES && MODEL_COST_OVERRIDES[model];
  const costPer1k = override ? parseFloat(override) : DEFAULT_COST_PER_1K_TOKENS;
  const cost = (totalTokens / 1000) * costPer1k;
  return Math.round(cost * 1_000_000);
}

function planRevenueCents(plan) {
  const value = PLAN_PRICES[plan] ?? 0;
  return Math.round(value * 100);
}

function toDateOnly(dateInput) {
  return dayjs(dateInput).startOf('day').toDate();
}

function monthKey(dateInput) {
  return dayjs(dateInput).format('YYYY-MM');
}

function normalizeBigInt(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

async function upsertInstallation({ installId, userId, plan, siteHash, meta }) {
  const planPriceCents = planRevenueCents(plan);

  const data = {
    userId,
    plan,
    planPriceCents,
    currency: meta?.currency || 'usd',
    siteHash,
    lastSeen: new Date(),
    pluginVersion: meta?.pluginVersion || undefined,
    wordpressVersion: meta?.wordpressVersion || undefined,
    phpVersion: meta?.phpVersion || undefined,
    isMultisite: Boolean(meta?.isMultisite),
    metadata: meta?.metadata || undefined,
  };

  if (meta?.installSecret) {
    data.installSecret = meta.installSecret;
  }

  const installation = await prisma.installation.upsert({
    where: { installId },
    update: data,
    create: {
      installId,
      userId,
      plan,
      planPriceCents,
      currency: data.currency,
      siteHash,
      installSecret: meta?.installSecret || null,
      firstSeen: new Date(),
      lastSeen: new Date(),
      pluginVersion: meta?.pluginVersion || null,
      wordpressVersion: meta?.wordpressVersion || null,
      phpVersion: meta?.phpVersion || null,
      isMultisite: Boolean(meta?.isMultisite),
      metadata: meta?.metadata || null,
    },
  });

  return installation;
}

function verifySignature(installId, signatureHeader, secret) {
  if (!secret) {
    return ALLOW_FIRST_SYNC_WITHOUT_SIGNATURE;
  }

  if (!signatureHeader) {
    return false;
  }

  const [signature, timestamp] = signatureHeader.split(':');
  if (!signature || !timestamp) {
    return false;
  }

  const timestampInt = parseInt(timestamp, 10);
  if (Number.isNaN(timestampInt)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampInt) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${installId}:${timestamp}`)
    .digest('hex');

  const provided = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (provided.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expectedBuffer);
}

async function ingestUsageBatch({ payload, headers, userId }) {
  const { install_id: installId, account_id: accountId, events } = payload;

  if (!installId || !Array.isArray(events) || events.length === 0) {
    throw new Error('Invalid payload: missing install_id or events');
  }

  const resolvedUserId = Number(accountId ?? userId);
  if (!Number.isInteger(resolvedUserId)) {
    throw new Error('Invalid account_id provided');
  }

  const user = await prisma.user.findUnique({ where: { id: resolvedUserId }, select: { id: true, plan: true } });
  if (!user) {
    throw new Error('Account not found');
  }

  const siteHash = installId.split('_').slice(-1)[0] || 'unknown';
  const installSecretHeader = headers['x-install-secret'];
  const signatureHeader = headers['x-install-signature'];

  const installation = await upsertInstallation({
    installId,
    userId: user.id,
    plan: headers['x-plan'] || user.plan || 'unknown',
    siteHash,
    meta: {
      installSecret: installSecretHeader,
      pluginVersion: headers['x-plugin-version'],
      wordpressVersion: headers['x-wp-version'],
      phpVersion: headers['x-php-version'],
      isMultisite: headers['x-is-multisite'] === '1',
    },
  });

  if (installation.installSecret) {
    const valid = verifySignature(installId, signatureHeader, installation.installSecret);
    if (!valid) {
      const error = new Error('Installation signature validation failed');
      error.code = 'invalid_signature';
      throw error;
    }
  } else if (installSecretHeader) {
    await prisma.installation.update({
      where: { id: installation.id },
      data: { installSecret: installSecretHeader },
    });
  } else if (!ALLOW_FIRST_SYNC_WITHOUT_SIGNATURE) {
    const error = new Error('Installation secret required');
    error.code = 'missing_signature';
    throw error;
  }

  const monthlyTotals = new Map();

  await prisma.$transaction(async (tx) => {
    for (const event of events) {
      const createdAt = event.created_at ? new Date(event.created_at) : new Date();
      const usageDate = toDateOnly(createdAt);
      const month = monthKey(createdAt);

      const totalTokens = Number(event.total_tokens || 0);
      const promptTokens = Number(event.prompt_tokens || 0);
      const completionTokens = Number(event.completion_tokens || 0);

      const costMicros = calculateCostMicros(event.model, totalTokens);
      const context = event.context ? event.context : null;

      try {
        await tx.usageEvent.create({
          data: {
            installationId: installation.id,
            eventId: event.event_id,
            userHash: event.wp_user_id_hash,
            source: event.source || 'unknown',
            model: event.model || 'unknown',
            promptTokens,
            completionTokens,
            totalTokens,
            context,
            createdAt,
            processedAt: event.processed_at ? new Date(event.processed_at) : null,
            costMicros,
            revenueCents: 0,
          },
        });
      } catch (error) {
        if (error.code === 'P2002') {
          continue;
        }
        throw error;
      }

      await tx.usageDailySummary.upsert({
        where: {
          usage_daily_unique: {
            installationId: installation.id,
            userHash: event.wp_user_id_hash,
            source: event.source || 'unknown',
            usageDate,
          },
        },
        update: {
          totalRequests: { increment: 1 },
          promptTokens: { increment: promptTokens },
          completionTokens: { increment: completionTokens },
          totalTokens: { increment: totalTokens },
          costMicros: { increment: costMicros },
        },
        create: {
          installationId: installation.id,
          userHash: event.wp_user_id_hash,
          source: event.source || 'unknown',
          usageDate,
          totalRequests: 1,
          promptTokens,
          completionTokens,
          totalTokens,
          costMicros,
          revenueCents: 0,
        },
      });

      const aggregate = monthlyTotals.get(month) || { requests: 0, tokens: 0, cost: 0 };
      aggregate.requests += 1;
      aggregate.tokens += totalTokens;
      aggregate.cost += costMicros;
      monthlyTotals.set(month, aggregate);
    }

    const planPriceCents = installation.planPriceCents || planRevenueCents(installation.plan);
    for (const [month, aggregate] of monthlyTotals.entries()) {
      await tx.usageMonthlySummary.upsert({
        where: {
          usage_monthly_unique: {
            installationId: installation.id,
            month,
          },
        },
        update: {
          totalRequests: { increment: aggregate.requests },
          totalTokens: { increment: aggregate.tokens },
          costMicros: { increment: aggregate.cost },
          revenueCents: planPriceCents,
        },
        create: {
          installationId: installation.id,
          month,
          totalRequests: aggregate.requests,
          totalTokens: aggregate.tokens,
          costMicros: aggregate.cost,
          revenueCents: planPriceCents,
        },
      });
    }
  }, { timeout: 30000 });

  return {
    installation,
    received: events.length,
  };
}

async function listInstallations({ limit = 50, offset = 0 } = {}) {
  const currentMonth = monthKey(new Date());

  const installations = await prisma.$queryRaw`
    SELECT
      i.id,
      i.install_id,
      i.plan,
      i.plan_price_cents,
      i.currency,
      i.site_hash,
      i.first_seen,
      i.last_seen,
      i.plugin_version,
      i.wordpress_version,
      i.php_version,
      i.is_multisite,
      i.user_id,
      u.email,
      u.plan AS user_plan,
      COALESCE(SUM(CASE WHEN ue.created_at >= NOW() - INTERVAL '30 days' THEN ue.total_tokens ELSE 0 END), 0) AS tokens_30d,
      COALESCE(ums.cost_micros, 0) AS cost_micros_mtd,
      COALESCE(ums.revenue_cents, i.plan_price_cents) AS revenue_cents_mtd
    FROM installations i
    JOIN users u ON u.id = i.user_id
    LEFT JOIN usage_events ue ON ue.installation_id = i.id
    LEFT JOIN usage_monthly_summary ums
      ON ums.installation_id = i.id
      AND ums.month = ${currentMonth}
    GROUP BY i.id, u.email, u.plan, ums.cost_micros, ums.revenue_cents
    ORDER BY i.last_seen DESC
    OFFSET ${offset}
    LIMIT ${limit};
  `;

  const total = await prisma.installation.count();

  const data = installations.map((row) => {
    const costMicros = normalizeBigInt(row.cost_micros_mtd || 0);
    const revenueCents = normalizeBigInt(row.revenue_cents_mtd || row.plan_price_cents || 0);
    const profitCents = revenueCents - Math.round(costMicros / 10_000);

    return {
      id: row.id,
      installId: row.install_id,
      plan: row.plan,
      planPriceCents: row.plan_price_cents,
      currency: row.currency,
      siteHash: row.site_hash,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      pluginVersion: row.plugin_version,
      wordpressVersion: row.wordpress_version,
      phpVersion: row.php_version,
      isMultisite: row.is_multisite,
      userId: row.user_id,
      userEmail: row.email,
      userPlan: row.user_plan,
      tokens30d: Number(row.tokens_30d || 0),
      costMicros,
      revenueCents,
      profitCents,
    };
  });

  return {
    data,
    meta: { total, limit, offset },
  };
}

async function fetchSummary({ installId, dateFrom, dateTo, groupBy = 'day', limit = 100, offset = 0 }) {
  const installation = await prisma.installation.findUnique({ where: { installId } });
  if (!installation) {
    throw new Error('Installation not found');
  }

  const where = {
    installationId: installation.id,
  };

  if (dateFrom) {
    where.usageDate = where.usageDate || {};
    where.usageDate.gte = toDateOnly(dateFrom);
  }
  if (dateTo) {
    where.usageDate = where.usageDate || {};
    where.usageDate.lte = toDateOnly(dateTo);
  }

  const summaries = await prisma.usageDailySummary.findMany({
    where,
    orderBy: { usageDate: 'desc' },
    skip: offset,
    take: limit,
  });

  const grouped = {};
  summaries.forEach((summary) => {
    let key;
    if (groupBy === 'user') {
      key = summary.userHash;
    } else if (groupBy === 'source') {
      key = summary.source;
    } else {
      key = dayjs(summary.usageDate).format('YYYY-MM-DD');
    }

    if (!grouped[key]) {
      grouped[key] = {
        key,
        totalRequests: 0,
        totalTokens: 0,
        costMicros: 0,
        revenueCents: 0,
      };
    }

    grouped[key].totalRequests += summary.totalRequests;
    grouped[key].totalTokens += summary.totalTokens;
    grouped[key].costMicros += Number(summary.costMicros);
    grouped[key].revenueCents += summary.revenueCents;
  });

  return Object.values(grouped).map((item) => ({
    ...item,
    profitCents: item.revenueCents - Math.round(item.costMicros / 10_000),
  }));
}

async function fetchEvents({ installId, userHash, source, dateFrom, dateTo, limit = 100, offset = 0 }) {
  const installation = await prisma.installation.findUnique({ where: { installId } });
  if (!installation) {
    throw new Error('Installation not found');
  }

  const where = {
    installationId: installation.id,
  };

  if (userHash) {
    where.userHash = userHash;
  }
  if (source) {
    where.source = source;
  }
  if (dateFrom) {
    where.createdAt = where.createdAt || {};
    where.createdAt.gte = new Date(dateFrom);
  }
  if (dateTo) {
    where.createdAt = where.createdAt || {};
    where.createdAt.lte = new Date(dateTo);
  }

  const [events, total] = await Promise.all([
    prisma.usageEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.usageEvent.count({ where }),
  ]);

  return {
    events: events.map((event) => ({
      ...event,
      costMicros: Number(event.costMicros),
    })),
    meta: { total, limit, offset },
  };
}

module.exports = {
  ingestUsageBatch,
  listInstallations,
  fetchSummary,
  fetchEvents,
};

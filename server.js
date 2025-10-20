/**
 * AltText AI - Proxy API Server
 * Securely handles OpenAI requests and tracks usage
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Utilities
function hashDomain(domain) {
  return crypto.createHash('sha256').update(domain).digest('hex');
}

function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function loadDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { usage: {}, lastReset: null };
  }
}

async function saveDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

async function getUsage(domainHash) {
  const db = await loadDB();
  const month = getCurrentMonth();
  
  if (!db.usage[domainHash]) {
    db.usage[domainHash] = {};
  }
  
  if (!db.usage[domainHash][month]) {
    db.usage[domainHash][month] = { count: 0, plan: 'free' };
  }
  
  return db.usage[domainHash][month];
}

async function incrementUsage(domainHash) {
  const db = await loadDB();
  const month = getCurrentMonth();
  
  if (!db.usage[domainHash]) {
    db.usage[domainHash] = {};
  }
  
  if (!db.usage[domainHash][month]) {
    db.usage[domainHash][month] = { count: 0, plan: 'free' };
  }
  
  db.usage[domainHash][month].count += 1;
  await saveDB(db);
  
  return db.usage[domainHash][month];
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate alt text endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { domain, image_data, context } = req.body;
    
    if (!domain) {
      return res.status(400).json({ 
        error: 'Domain is required',
        code: 'MISSING_DOMAIN'
      });
    }
    
    // Hash domain for privacy
    const domainHash = hashDomain(domain);
    
    // Check current usage
    const usage = await getUsage(domainHash);
    const limit = usage.plan === 'pro' ? parseInt(process.env.PRO_MONTHLY_LIMIT) : parseInt(process.env.FREE_MONTHLY_LIMIT);
    
    if (usage.count >= limit) {
      return res.status(429).json({
        error: 'Monthly limit reached',
        code: 'LIMIT_REACHED',
        usage: {
          used: usage.count,
          limit: limit,
          plan: usage.plan,
          resetDate: getNextResetDate()
        }
      });
    }
    
    // Build OpenAI prompt
    const prompt = buildPrompt(image_data, context);
    
    // Call OpenAI API
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing concise, SEO-friendly alt text for images. Write clear, descriptive alt text in 8-16 words that accurately describes the image content.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const altText = openaiResponse.data.choices[0].message.content.trim();
    
    // Increment usage
    const newUsage = await incrementUsage(domainHash);
    
    // Return response with usage data
    res.json({
      success: true,
      alt_text: altText,
      usage: {
        used: newUsage.count,
        limit: limit,
        remaining: limit - newUsage.count,
        plan: newUsage.plan,
        resetDate: getNextResetDate()
      },
      tokens: openaiResponse.data.usage
    });
    
  } catch (error) {
    console.error('Generate error:', error.response?.data || error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'OpenAI rate limit reached. Please try again later.',
        code: 'OPENAI_RATE_LIMIT'
      });
    }
    
    res.status(500).json({
      error: 'Failed to generate alt text',
      code: 'GENERATION_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get usage for a domain
app.get('/api/usage/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const domainHash = hashDomain(domain);
    const usage = await getUsage(domainHash);
    const limit = usage.plan === 'pro' ? parseInt(process.env.PRO_MONTHLY_LIMIT) : parseInt(process.env.FREE_MONTHLY_LIMIT);
    
    res.json({
      success: true,
      usage: {
        used: usage.count,
        limit: limit,
        remaining: limit - usage.count,
        plan: usage.plan,
        resetDate: getNextResetDate()
      }
    });
  } catch (error) {
    console.error('Usage fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch usage',
      code: 'USAGE_ERROR'
    });
  }
});

// Webhook for monthly reset (protected by secret)
app.post('/api/webhook/reset', async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    const db = await loadDB();
    const month = getCurrentMonth();
    
    // Archive old data (optional)
    // In production, you'd want to move old data to a proper database
    
    db.lastReset = new Date().toISOString();
    await saveDB(db);
    
    res.json({
      success: true,
      message: 'Usage reset completed',
      month: month
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// Admin endpoint - upgrade a domain to pro (temporary, until Stripe integration)
app.post('/api/admin/upgrade', async (req, res) => {
  try {
    const { domain, secret, plan } = req.body;
    
    if (secret !== process.env.API_SECRET) {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    const domainHash = hashDomain(domain);
    const db = await loadDB();
    const month = getCurrentMonth();
    
    if (!db.usage[domainHash]) {
      db.usage[domainHash] = {};
    }
    
    if (!db.usage[domainHash][month]) {
      db.usage[domainHash][month] = { count: 0, plan: 'free' };
    }
    
    db.usage[domainHash][month].plan = plan || 'pro';
    await saveDB(db);
    
    res.json({
      success: true,
      message: `Domain upgraded to ${plan || 'pro'}`,
      usage: db.usage[domainHash][month]
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Upgrade failed' });
  }
});

// Helper functions
function buildPrompt(imageData, context) {
  let prompt = 'Generate concise, SEO-friendly alt text for this image.';
  
  if (context?.filename) {
    prompt += `\n\nFilename: ${context.filename}`;
  }
  
  if (context?.title) {
    prompt += `\nImage title: ${context.title}`;
  }
  
  if (context?.caption) {
    prompt += `\nCaption: ${context.caption}`;
  }
  
  if (context?.post_title) {
    prompt += `\nPage context: ${context.post_title}`;
  }
  
  prompt += '\n\nProvide only the alt text, nothing else. Keep it under 16 words.';
  
  return prompt;
}

function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AltText AI API running on port ${PORT}`);
  console.log(`📅 Current month: ${getCurrentMonth()}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});


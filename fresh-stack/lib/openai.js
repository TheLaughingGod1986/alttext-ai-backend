const axios = require('axios');
const { OPENAI_MAX_TOKENS } = require('./constants');

/**
 * Makes an OpenAI chat completion request with vision support
 */
async function makeOpenAIRequest(model, prompt, imageUrl, apiKey) {
  return await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      temperature: 0.2,
      max_tokens: OPENAI_MAX_TOKENS,
      messages: [
        { role: 'system', content: 'You are an accessibility assistant that writes excellent alternative text.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
          ]
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );
}

function buildPrompt(context = {}) {
  const lines = [
    'Write a concise, specific alt text for the image.',
    'Rules:',
    '- 10-16 words, under ~110 characters.',
    '- Mention subjects, action, setting, colors; include any legible text verbatim.',
    '- Use 1-2 relevant keywords from context/filename naturally.',
    '- No filler like "image of" or "picture of".',
  ];

  const hints = [];
  if (context.title) hints.push(`Title: ${context.title}`);
  if (context.caption) hints.push(`Caption: ${context.caption}`);
  if (context.pageTitle) hints.push(`Page: ${context.pageTitle}`);
  if (context.filename) hints.push(`File: ${context.filename}`);
  if (context.altTextSuggestion) hints.push(`User suggestion: ${context.altTextSuggestion}`);

  if (hints.length) {
    lines.push('');
    lines.push('Context:');
    lines.push(...hints);
  }

  lines.push('');
  lines.push('Return only the alt text.');
  return lines.join('\n');
}

async function generateAltText({ image, context }) {
  const apiKey = process.env.ALTTEXT_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  // Prefer a vision-capable model; fall back to gpt-4o-mini if not available.
  const preferredModel = process.env.OPENAI_MODEL || 'gpt-4o';
  const fallbackModel = 'gpt-4o-mini';
  let modelUsed = preferredModel;

  const prompt = buildPrompt(context);
  const imageUrl = image.base64
    ? `data:${image.mime_type};base64,${image.base64}`
    : image.url;

  if (!apiKey) {
    return {
      altText: fallbackAltText(context),
      usage: null,
      meta: { usedFallback: true, reason: 'Missing OpenAI API key' }
    };
  }

  try {
    let response;
    try {
      response = await makeOpenAIRequest(modelUsed, prompt, imageUrl, apiKey);
    } catch (firstError) {
      const msg = firstError?.response?.data?.error?.message || '';
      const modelMissing = /model.+does not exist/i.test(msg) || /You must provide a model parameter/.test(msg);
      if (modelMissing && modelUsed !== fallbackModel) {
        modelUsed = fallbackModel;
        response = await makeOpenAIRequest(modelUsed, prompt, imageUrl, apiKey);
      } else {
        throw firstError;
      }
    }

    const choice = response.data?.choices?.[0];
    const altText = choice?.message?.content?.trim();

    return {
      altText: altText || fallbackAltText(context),
      usage: response.data?.usage || null,
      meta: { usedFallback: !altText || modelUsed === fallbackModel, modelUsed }
    };
  } catch (error) {
    const message = error?.response?.data?.error?.message || error.message || 'OpenAI request failed';
    return {
      altText: fallbackAltText(context),
      usage: null,
      meta: { usedFallback: true, reason: message }
    };
  }
}

function fallbackAltText(context = {}) {
  const base = context.title || context.caption || context.pageTitle || 'Image';
  return `${base}: concise descriptive alt text placeholder`;
}

module.exports = {
  generateAltText
};

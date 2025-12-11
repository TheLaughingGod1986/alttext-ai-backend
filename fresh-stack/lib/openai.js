const axios = require('axios');

function buildPrompt(context = {}) {
  const lines = [
    'Write descriptive alternative text for this image.',
    'Requirements:',
    '- Length: 10-15 words (125 characters max for optimal accessibility/SEO)',
    '- Include relevant keywords naturally based on context',
    '- Describe: subjects, actions, setting, visible text',
    '- For logos/icons: state brand name and recognizable elements',
    '- Avoid filler: "image of", "picture of", "photo of"',
    '- Be specific: "woman presenting sales chart" vs "woman at computer"'
  ];

  const hints = [];
  if (context.title) hints.push(`Title: ${context.title}`);
  if (context.caption) hints.push(`Caption: ${context.caption}`);
  if (context.pageTitle) hints.push(`Page: ${context.pageTitle}`);

  // Extract keywords from filename (remove extension, replace dashes/underscores)
  if (context.filename) {
    const cleanFilename = context.filename
      .replace(/[-_]/g, ' ')
      .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    hints.push(`File: ${cleanFilename}`);
  }

  if (context.altTextSuggestion) hints.push(`User suggestion: ${context.altTextSuggestion}`);

  if (hints.length) {
    lines.push('');
    lines.push('Context (use for keyword relevance):');
    lines.push(...hints);
  }

  lines.push('');
  lines.push('Return only the alt text (no quotes, no explanation).');
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
      response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: modelUsed,
          temperature: 0.2,
          max_tokens: 50,
          messages: [
            {
              role: 'system',
              content: 'Expert at WCAG 2.1 Level AA alt text optimized for accessibility and SEO. Write natural, keyword-rich descriptions (10-15 words, 125 chars max). Be specific and descriptive.'
            },
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
    } catch (firstError) {
      const msg = firstError?.response?.data?.error?.message || '';
      const modelMissing = /model.+does not exist/i.test(msg) || /You must provide a model parameter/.test(msg);
      if (modelMissing && modelUsed !== fallbackModel) {
        modelUsed = fallbackModel;
        response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: modelUsed,
            temperature: 0.2,
            max_tokens: 50,
            messages: [
              {
                role: 'system',
                content: 'Expert at WCAG 2.1 Level AA alt text optimized for accessibility and SEO. Write natural, keyword-rich descriptions (10-15 words, 125 chars max). Be specific and descriptive.'
              },
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

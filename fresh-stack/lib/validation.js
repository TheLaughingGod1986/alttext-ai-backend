const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function stripDataUrl(value = '') {
  if (value.startsWith('data:')) {
    const [, base64Part] = value.split('base64,');
    return base64Part || '';
  }
  return value;
}

function validateImagePayload(image = {}) {
  const errors = [];
  const warnings = [];

  const rawBase64 = stripDataUrl(image.base64 || image.image_base64 || '');
  const hasBase64 = Boolean(rawBase64);
  const hasUrl = Boolean(image.url);

  if (!hasBase64 && !hasUrl) {
    errors.push('Provide either base64/image_base64 or a public https image URL.');
    return { errors, warnings, normalized: null };
  }

  if (hasBase64) {
    if (!BASE64_PATTERN.test(rawBase64.trim())) {
      errors.push('Base64 data contains invalid characters. Ensure it is a clean base64 string without URL or metadata.');
    }
  }

  // Dimensions help keep token usage predictable; we warn if missing.
  const width = Number(image.width) || Number(image.reportedWidth) || null;
  const height = Number(image.height) || Number(image.reportedHeight) || null;
  if (!width || !height) {
    warnings.push('Width and height are missing; include them to keep token costs predictable.');
  }

  // Analyze size expectations when base64 is present.
  if (hasBase64) {
    const base64Length = rawBase64.length;
    const decodedBytes = Math.round(base64Length * 0.75);
    const base64SizeKB = Math.round(decodedBytes / 1024);
    const pixelCount = width && height ? width * height : null;

    const bytesPerPixel = pixelCount ? decodedBytes / pixelCount : null;

    // Expected range based on light compression; only warn, do not block.
    if (bytesPerPixel !== null) {
      if (bytesPerPixel < 0.01) {
        warnings.push(`Payload seems tiny for ${width}x${height} (${bytesPerPixel.toFixed(4)} bytes/px). Verify the image is fully encoded.`);
      } else if (bytesPerPixel > 0.35) {
        warnings.push(`Payload seems large for ${width}x${height} (${bytesPerPixel.toFixed(3)} bytes/px). Resize or compress before sending.`);
      }
    } else if (base64SizeKB < 5) {
      warnings.push('Base64 payload is under 5KB; ensure the image is not truncated.');
    }

    // Guardrails against enormous blobs: warn above 1MB, hard-fail above 4MB.
    const WARN_BASE64_KB = 1024;
    const MAX_BASE64_KB = 4096;
    if (base64SizeKB > MAX_BASE64_KB) {
      errors.push(`Base64 payload is too large (${base64SizeKB}KB). Resize before sending (target under ${MAX_BASE64_KB}KB).`);
    } else if (base64SizeKB > WARN_BASE64_KB) {
      warnings.push(`Base64 payload is large (${base64SizeKB}KB). Consider resizing/compressing to stay under ${WARN_BASE64_KB}KB to control token costs.`);
    }
  }

  // If URL is present but not https, warn.
  if (hasUrl && !String(image.url).startsWith('https://')) {
    warnings.push('Image URL should be https to be fetchable by the model.');
  }

  const normalized = {
    base64: hasBase64 ? rawBase64 : null,
    url: hasUrl ? image.url : null,
    width,
    height,
    filename: image.filename || null,
    mime_type: image.mime_type || (image.url && guessMimeFromUrl(image.url)) || 'image/jpeg'
  };

  return { errors, warnings, normalized };
}

function guessMimeFromUrl(url = '') {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

module.exports = {
  validateImagePayload,
  stripDataUrl
};

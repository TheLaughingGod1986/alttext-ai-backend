/**
 * API Key Utility Functions
 * Handles API key selection with fallback logic
 */

/**
 * Get API key with fallback support
 * @param {string} primaryKey - Primary environment variable name
 * @param {string} fallbackKey - Fallback environment variable name
 * @returns {string|null} - API key or null if not found
 */
function getApiKey(primaryKey, fallbackKey) {
  const primary = process.env[primaryKey];
  const fallback = process.env[fallbackKey];
  
  // Use primary if it exists and is not empty
  if (primary && typeof primary === 'string' && primary.trim() !== '') {
    return primary;
  }
  
  // Use fallback if it exists and is not empty
  if (fallback && typeof fallback === 'string' && fallback.trim() !== '') {
    return fallback;
  }
  
  return null;
}

/**
 * Get API key for a specific service
 * @param {string} service - Service name ('alttext-ai' or 'seo-ai-meta')
 * @returns {string|null} - API key or null if not found
 */
function getServiceApiKey(service) {
  if (service === 'seo-ai-meta') {
    return getApiKey('SEO_META_OPENAI_API_KEY', 'OPENAI_API_KEY');
  }
  return getApiKey('ALTTEXT_OPENAI_API_KEY', 'OPENAI_API_KEY');
}

/**
 * Get review API key with fallback chain
 * @param {string} service - Service name
 * @returns {string|null} - API key or null if not found
 */
function getReviewApiKey(service) {
  if (service === 'seo-ai-meta') {
    return getApiKey('OPENAI_REVIEW_API_KEY', 'SEO_META_OPENAI_API_KEY') || 
           getApiKey('SEO_META_OPENAI_API_KEY', 'OPENAI_API_KEY');
  }
  return getApiKey('OPENAI_REVIEW_API_KEY', 'ALTTEXT_OPENAI_API_KEY') || 
         getApiKey('ALTTEXT_OPENAI_API_KEY', 'OPENAI_API_KEY');
}

module.exports = {
  getApiKey,
  getServiceApiKey,
  getReviewApiKey
};


/**
 * Email template exports (JavaScript fallback)
 * 
 * This file provides a fallback for production environments where TypeScript
 * files cannot be loaded directly. The renderHelper will gracefully fall back
 * to inline HTML templates if React Email components are not available.
 */

// Export empty objects - renderHelper will detect this and use fallback templates
module.exports = {};


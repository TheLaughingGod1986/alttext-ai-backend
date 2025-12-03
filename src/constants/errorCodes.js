/**
 * Error Codes Constants
 * Standardized error codes for consistent error handling across the API
 * Keeps all clients consistent
 */

module.exports = {
  NO_ACCESS: "NO_ACCESS",
  REASONS: {
    NO_SUBSCRIPTION: "no_subscription",
    SUBSCRIPTION_INACTIVE: "subscription_inactive",
    NO_CREDITS: "no_credits",
    PLAN_LIMIT: "plan_limit",
    NO_IDENTITY: "no_identity",
  }
};


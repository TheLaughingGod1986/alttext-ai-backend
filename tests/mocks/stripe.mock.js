const jestMock = require('jest-mock');

let lastInstance = null;

// Subscription state store - persists subscription states across calls
const subscriptionStore = new Map();

// Payment method override store - allows tests to override payment method behavior
let paymentMethodOverride = null;

// Subscription retrieve override - allows tests to override subscription retrieve behavior
let subscriptionRetrieveOverride = null;

// Session ID counters for consistent IDs
let checkoutSessionCounter = 0;
let portalSessionCounter = 0;

/**
 * Get or create subscription in store
 */
function getSubscription(subscriptionId, defaultData = {}) {
  if (!subscriptionStore.has(subscriptionId)) {
    const defaultSubscription = {
      id: subscriptionId,
      status: 'active',
      items: { data: [{ price: { id: 'price_1SMrxaJl9Rm418cMM4iikjlJ' } }] },
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      cancel_at_period_end: false,
      default_payment_method: 'pm_test',
      ...defaultData
    };
    subscriptionStore.set(subscriptionId, defaultSubscription);
  }
  return subscriptionStore.get(subscriptionId);
}

/**
 * Update subscription state (supports transitions)
 */
function updateSubscription(subscriptionId, updates) {
  const subscription = getSubscription(subscriptionId);
  Object.assign(subscription, updates);
  subscriptionStore.set(subscriptionId, subscription);
  return subscription;
}

/**
 * Create a Proxy-based mock that auto-generates methods for ANY Stripe API call
 * This prevents "undefined is not a function" errors for missing methods
 */
function createStripeResourceProxy(resourceName) {
  return new Proxy({}, {
    get(target, method) {
      // Return existing method if defined
      if (target[method]) {
        return target[method];
      }

      // Auto-generate a mock for any missing method
      const mockFn = jestMock.fn().mockResolvedValue({
        id: `${resourceName}_${method}_test`,
        object: resourceName,
        data: []
      });

      // Cache the mock so repeated calls get the same function
      target[method] = mockFn;
      return mockFn;
    }
  });
}

class StripeMock {
  constructor() {
    // Checkout sessions with consistent IDs (special behavior)
    const checkoutSessions = createStripeResourceProxy('checkout_session');
    checkoutSessions.create = jestMock.fn(async (params) => {
      checkoutSessionCounter++;
      const sessionId = `cs_test_${String(checkoutSessionCounter).padStart(5, '0')}`;
      return {
        id: sessionId,
        url: `https://checkout.test/session/${sessionId}`
      };
    });
    checkoutSessions.retrieve = jestMock.fn().mockResolvedValue({
      id: 'cs_test_00001',
      line_items: { data: [{ price: { id: 'price_test' } }] }
    });

    this.checkout = createStripeResourceProxy('checkout');
    this.checkout.sessions = checkoutSessions;

    // Billing portal sessions with consistent IDs (special behavior)
    const portalSessions = createStripeResourceProxy('billing_portal_session');
    portalSessions.create = jestMock.fn(async (params) => {
      portalSessionCounter++;
      const sessionId = `bps_test_${String(portalSessionCounter).padStart(5, '0')}`;
      return {
        id: sessionId,
        url: `https://stripe.test/portal/session/${sessionId}`
      };
    });

    this.billingPortal = createStripeResourceProxy('billing_portal');
    this.billingPortal.sessions = portalSessions;

    // Subscriptions with state persistence (special behavior)
    this.subscriptions = createStripeResourceProxy('subscription');
    this.subscriptions.retrieve = jestMock.fn(async (subscriptionId) => {
      // If override is set, use it (for testing errors)
      if (subscriptionRetrieveOverride !== null) {
        if (typeof subscriptionRetrieveOverride === 'function') {
          return subscriptionRetrieveOverride(subscriptionId);
        }
        throw subscriptionRetrieveOverride;
      }
      // Default subscription ID if not provided
      const subId = subscriptionId || 'sub_test';
      return getSubscription(subId);
    });
    this.subscriptions.update = jestMock.fn(async (subscriptionId, updates) => {
      return updateSubscription(subscriptionId, updates);
    });
    this.subscriptions.cancel = jestMock.fn(async (subscriptionId) => {
      return updateSubscription(subscriptionId, {
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000)
      });
    });

    // Prices with Proxy fallback
    this.prices = createStripeResourceProxy('price');
    this.prices.list = jestMock.fn().mockResolvedValue({ data: [] });

    // Customers with Proxy fallback
    this.customers = createStripeResourceProxy('customer');
    this.customers.create = jestMock.fn().mockResolvedValue({ id: 'cus_test', email: 'test@example.com' });
    this.customers.retrieve = jestMock.fn().mockResolvedValue({ id: 'cus_test', email: 'test@example.com' });
    this.customers.list = jestMock.fn().mockResolvedValue({ data: [{ id: 'cus_test', email: 'test@example.com' }] });

    // Payment methods with override support (special behavior)
    this.paymentMethods = createStripeResourceProxy('payment_method');
    this.paymentMethods.retrieve = jestMock.fn(async (pmId) => {
      // If override is set, use it
      if (paymentMethodOverride !== null) {
        return paymentMethodOverride;
      }
      // Default behavior
      return {
        card: {
          last4: '4242',
          brand: 'visa',
          exp_month: 12,
          exp_year: 2030
        }
      };
    });

    // Invoices with Proxy fallback
    this.invoices = createStripeResourceProxy('invoice');
    this.invoices.list = jestMock.fn().mockResolvedValue({ data: [] });
    this.invoices.retrieve = jestMock.fn().mockResolvedValue({
      id: 'in_test',
      customer: 'cus_test',
      subscription: 'sub_test',
      status: 'paid'
    });

    // Webhooks with special behavior
    this.webhooks = createStripeResourceProxy('webhook');
    this.webhooks.constructEvent = jestMock.fn((payload) => payload);

    // Auto-generate ANY other Stripe resources not explicitly defined
    // This catches charges, paymentIntents, refunds, disputes, etc.
    return new Proxy(this, {
      get(target, prop) {
        // Return existing property if defined
        if (target[prop]) {
          return target[prop];
        }

        // Auto-generate a resource proxy for any undefined Stripe resource
        const resource = createStripeResourceProxy(prop);
        target[prop] = resource;
        return resource;
      }
    });
  }
}

const StripeConstructor = jestMock.fn(() => {
  lastInstance = new StripeMock();
  return lastInstance;
});

function resetStripeMock() {
  // Clear subscription store
  subscriptionStore.clear();

  // Reset payment method override
  paymentMethodOverride = null;

  // Reset subscription retrieve override
  subscriptionRetrieveOverride = null;

  // Reset session counters
  checkoutSessionCounter = 0;
  portalSessionCounter = 0;

  if (lastInstance) {
    // Helper to recursively reset all mock functions in an object
    function resetAllMocks(obj) {
      if (!obj || typeof obj !== 'object') return;

      Object.keys(obj).forEach((key) => {
        const value = obj[key];

        // If it's a mock function, reset it
        if (value && typeof value.mockReset === 'function') {
          value.mockReset();
        }

        // If it's an object, recursively reset its children
        if (value && typeof value === 'object' && !value.mockReset) {
          resetAllMocks(value);
        }
      });
    }

    // Reset all resources
    resetAllMocks(lastInstance.checkout);
    resetAllMocks(lastInstance.billingPortal);
    resetAllMocks(lastInstance.subscriptions);
    resetAllMocks(lastInstance.prices);
    resetAllMocks(lastInstance.customers);
    resetAllMocks(lastInstance.paymentMethods);
    resetAllMocks(lastInstance.invoices);
    resetAllMocks(lastInstance.webhooks);

    // Re-apply default implementations to special methods
    lastInstance.subscriptions.retrieve.mockImplementation(async (subscriptionId) => {
      if (subscriptionRetrieveOverride !== null) {
        if (typeof subscriptionRetrieveOverride === 'function') {
          return subscriptionRetrieveOverride(subscriptionId);
        }
        throw subscriptionRetrieveOverride;
      }
      const subId = subscriptionId || 'sub_test';
      return getSubscription(subId);
    });

    lastInstance.subscriptions.update.mockImplementation(async (subscriptionId, updates) => {
      return updateSubscription(subscriptionId, updates);
    });

    lastInstance.subscriptions.cancel.mockImplementation(async (subscriptionId) => {
      return updateSubscription(subscriptionId, {
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000)
      });
    });

    lastInstance.customers.create.mockResolvedValue({ id: 'cus_test', email: 'test@example.com' });
    lastInstance.customers.retrieve.mockResolvedValue({ id: 'cus_test', email: 'test@example.com' });
    lastInstance.customers.list.mockResolvedValue({ data: [{ id: 'cus_test', email: 'test@example.com' }] });

    lastInstance.paymentMethods.retrieve.mockImplementation(async (pmId) => {
      if (paymentMethodOverride !== null) {
        return paymentMethodOverride;
      }
      return {
        card: {
          last4: '4242',
          brand: 'visa',
          exp_month: 12,
          exp_year: 2030
        }
      };
    });

    lastInstance.checkout.sessions.create.mockImplementation(async (params) => {
      checkoutSessionCounter++;
      const sessionId = `cs_test_${String(checkoutSessionCounter).padStart(5, '0')}`;
      return {
        id: sessionId,
        url: `https://checkout.test/session/${sessionId}`
      };
    });

    lastInstance.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_test_00001',
      line_items: { data: [{ price: { id: 'price_test' } }] }
    });

    lastInstance.billingPortal.sessions.create.mockImplementation(async (params) => {
      portalSessionCounter++;
      const sessionId = `bps_test_${String(portalSessionCounter).padStart(5, '0')}`;
      return {
        id: sessionId,
        url: `https://stripe.test/portal/session/${sessionId}`
      };
    });

    lastInstance.prices.list.mockResolvedValue({ data: [] });

    lastInstance.invoices.list.mockResolvedValue({ data: [] });
    lastInstance.invoices.retrieve.mockResolvedValue({
      id: 'in_test',
      customer: 'cus_test',
      subscription: 'sub_test',
      status: 'paid'
    });

    lastInstance.webhooks.constructEvent.mockImplementation((payload) => payload);
  }

  StripeConstructor.mockClear();
}

/**
 * Helper to set subscription state (for testing transitions)
 */
function setSubscriptionState(subscriptionId, state) {
  updateSubscription(subscriptionId, state);
}

/**
 * Helper to transition subscription (trialing → active, active → past_due, etc.)
 */
function transitionSubscription(subscriptionId, newStatus) {
  const subscription = getSubscription(subscriptionId);
  const transitions = {
    'trialing': { status: 'trialing' },
    'active': { status: 'active' },
    'past_due': { status: 'past_due' },
    'canceled': { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) },
    'unpaid': { status: 'unpaid' }
  };
  
  if (transitions[newStatus]) {
    updateSubscription(subscriptionId, transitions[newStatus]);
  }
}

/**
 * Helper to set payment method override (for testing payment method without card)
 */
function setPaymentMethodOverride(override) {
  paymentMethodOverride = override;
}

/**
 * Helper to set subscription retrieve override (for testing errors)
 */
function setSubscriptionRetrieveOverride(override) {
  subscriptionRetrieveOverride = override;
}

module.exports = StripeConstructor;
module.exports.__resetStripe = resetStripeMock;
module.exports.__getLastInstance = () => lastInstance;
module.exports.__setSubscriptionState = setSubscriptionState;
module.exports.__transitionSubscription = transitionSubscription;
module.exports.__getSubscriptionStore = () => subscriptionStore;
module.exports.__setPaymentMethodOverride = setPaymentMethodOverride;
module.exports.__setSubscriptionRetrieveOverride = setSubscriptionRetrieveOverride;


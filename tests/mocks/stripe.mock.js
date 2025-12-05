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

class StripeMock {
  constructor() {
    // Checkout sessions with consistent IDs
    this.checkout = {
      sessions: {
        create: jestMock.fn(async (params) => {
          checkoutSessionCounter++;
          const sessionId = `cs_test_${String(checkoutSessionCounter).padStart(5, '0')}`;
          return {
            id: sessionId,
            url: `https://checkout.test/session/${sessionId}`
          };
        }),
        retrieve: jestMock.fn().mockResolvedValue({
          id: 'cs_test_00001',
          line_items: { data: [{ price: { id: 'price_test' } }] }
        })
      }
    };

    // Billing portal sessions with consistent IDs
    this.billingPortal = {
      sessions: {
        create: jestMock.fn(async (params) => {
          portalSessionCounter++;
          const sessionId = `bps_test_${String(portalSessionCounter).padStart(5, '0')}`;
          return {
            id: sessionId,
            url: `https://stripe.test/portal/session/${sessionId}`
          };
        })
      }
    };

    // Subscriptions with state persistence
    this.subscriptions = {
      retrieve: jestMock.fn(async (subscriptionId) => {
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
      }),
      update: jestMock.fn(async (subscriptionId, updates) => {
        return updateSubscription(subscriptionId, updates);
      }),
      cancel: jestMock.fn(async (subscriptionId) => {
        return updateSubscription(subscriptionId, { 
          status: 'canceled',
          canceled_at: Math.floor(Date.now() / 1000)
        });
      })
    };

    this.prices = {
      list: jestMock.fn().mockResolvedValue({ data: [] })
    };

    this.customers = {
      create: jestMock.fn().mockResolvedValue({ id: 'cus_test', email: 'test@example.com' }),
      retrieve: jestMock.fn().mockResolvedValue({ id: 'cus_test', email: 'test@example.com' }),
      list: jestMock.fn().mockResolvedValue({ data: [{ id: 'cus_test', email: 'test@example.com' }] })
    };

    this.paymentMethods = {
      retrieve: jestMock.fn(async (pmId) => {
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
      })
    };

    this.webhooks = {
      constructEvent: jestMock.fn((payload) => payload)
    };
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
    const sections = [
      lastInstance.checkout.sessions,
      lastInstance.billingPortal.sessions,
      lastInstance.subscriptions,
      lastInstance.prices,
      lastInstance.customers,
      lastInstance.paymentMethods,
      lastInstance.webhooks
    ];

    sections.forEach((section) => {
      Object.values(section).forEach((fn) => {
        if (typeof fn.mockReset === 'function') {
          fn.mockReset();
        }
      });
    });
    
    // Reset subscription retrieve to default behavior
    lastInstance.subscriptions.retrieve.mockImplementation(async (subscriptionId) => {
      const subId = subscriptionId || 'sub_test';
      return getSubscription(subId);
    });

    // Reset customers.list to default behavior
    lastInstance.customers.list.mockResolvedValue({ data: [{ id: 'cus_test', email: 'test@example.com' }] });
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


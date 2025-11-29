# Credits System

## Overview

The credits system is an event-driven credit management system that tracks credit purchases, spending, and balance. Credits are stored in the unified `events` table, with a cached `credits_balance` column in the `identities` table for performance.

## Architecture

### Event-Driven Design

Credits are tracked through events in the `events` table:
- **Positive `credits_delta`** = Credit purchases/additions
- **Negative `credits_delta`** = Credit usage/spending

The balance is calculated as: `SUM(credits_delta)` for all events for an identity.

### Cached Balance

The `identities.credits_balance` column is a cached value that's updated by `eventService` after each credit transaction. It serves as a fast lookup but the events table is the source of truth.

## Spending Credits

### spendCredits Method

**Location:** `src/services/creditsService.js`

```javascript
async function spendCredits(identityId, amount = 1, metadata = {})
```

#### Behavior

1. **Checks current balance** from events table
2. **Validates sufficient credits** - returns error if insufficient
3. **Logs usage event** to `events` table with negative `credits_delta`
4. **Updates cached balance** via `eventService`
5. **Returns remaining balance**

#### Example

```javascript
const result = await creditsService.spendCredits(identityId, 1, {
  image_url: 'https://example.com/image.jpg',
  plugin: 'alttext-ai'
});

if (result.success) {
  console.log('Credits remaining:', result.remainingBalance);
} else {
  console.error('Insufficient credits:', result.currentBalance);
}
```

#### Error Cases

- **INSUFFICIENT_CREDITS**: User doesn't have enough credits
  ```json
  {
    "success": false,
    "error": "INSUFFICIENT_CREDITS",
    "currentBalance": 5,
    "requested": 10
  }
  ```

### deductCreditByEmail Method

Atomic operation to deduct 1 credit by email:

```javascript
async function deductCreditByEmail(email)
```

Automatically gets/creates identity and deducts 1 credit atomically.

## Adding Credit Packs

### Credit Packs Catalog

**Location:** `src/data/creditPacks.js`

Available packs:
- `pack_100`: 100 credits for £3.00 (300 pence)
- `pack_500`: 500 credits for £12.00 (1200 pence)
- `pack_1000`: 1000 credits for £20.00 (2000 pence)
- `pack_2500`: 2500 credits for £45.00 (4500 pence)

### addCredits Method

**Location:** `src/services/creditsService.js`

```javascript
async function addCredits(identityId, amount, stripePaymentIntentId = null)
```

#### Behavior

1. **Validates parameters** - identityId and positive amount required
2. **Logs purchase event** to `events` table with positive `credits_delta`
3. **Updates cached balance** via `eventService`
4. **Returns new balance**

#### Example

```javascript
const result = await creditsService.addCredits(
  identityId,
  100, // credits
  'pi_1234567890' // Stripe payment intent ID
);

if (result.success) {
  console.log('New balance:', result.newBalance);
  console.log('Transaction ID:', result.transactionId);
}
```

### addCreditsByEmail Method

Wrapper that gets/creates identity and adds credits:

```javascript
async function addCreditsByEmail(email, amount, source = 'manual', transactionId = null)
```

## Balance Tracking

### getBalance Method

**Location:** `src/services/creditsService.js`

```javascript
async function getBalance(identityId)
```

#### Behavior

1. **Computes balance from events table** (source of truth)
2. **Falls back to cached `credits_balance`** if events query fails
3. **Returns current balance**

#### Example

```javascript
const result = await creditsService.getBalance(identityId);
if (result.success) {
  console.log('Current balance:', result.balance);
}
```

### getBalanceByEmail Method

Wrapper that gets/creates identity and returns balance:

```javascript
async function getBalanceByEmail(email)
```

### Balance Calculation

Balance is calculated from the `events` table:

```sql
SELECT SUM(credits_delta) 
FROM events 
WHERE identity_id = ?
```

- Positive deltas = purchases
- Negative deltas = usage
- Sum = current balance

## Event-Driven Usage

### Event Types

- **`credit_purchase`**: Credits added (positive `credits_delta`)
- **`credit_used`**: Credits spent (negative `credits_delta`)

### Event Metadata

Events can include metadata:

```javascript
{
  stripe_payment_intent_id: 'pi_1234567890',
  source: 'purchase',
  image_url: 'https://example.com/image.jpg',
  plugin: 'alttext-ai'
}
```

### Event Service Integration

**Location:** `src/services/eventService.js`

The `eventService` handles:
- Logging events to `events` table
- Updating cached `credits_balance` after each transaction
- Calculating balance from events

#### logEvent Method

```javascript
async function logEvent(identityId, eventType, creditsDelta = 0, metadata = {})
```

#### getCreditBalance Method

```javascript
async function getCreditBalance(identityId)
```

Calculates balance by summing all `credits_delta` values for the identity.

## Transaction History

### getTransactionHistory Method

**Location:** `src/services/creditsService.js`

```javascript
async function getTransactionHistory(identityId, page = 1, limit = 50)
```

#### Returns

```json
{
  "success": true,
  "transactions": [
    {
      "id": "uuid",
      "identity_id": "uuid",
      "transaction_type": "purchase",
      "amount": 100,
      "balance_after": 150,
      "created_at": "2024-01-01T00:00:00Z",
      "metadata": {}
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

### getTransactionsByEmail Method

Wrapper that gets transactions by email:

```javascript
async function getTransactionsByEmail(email, page = 1, limit = 50)
```

## API Endpoints

### GET /credits/balance

Returns current credit balance for authenticated user.

**Response:**
```json
{
  "ok": true,
  "balance": 150
}
```

### GET /credits/transactions

Returns transaction history for authenticated user.

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response:**
```json
{
  "ok": true,
  "transactions": [...],
  "pagination": {...}
}
```

### POST /credits/purchase

Initiates credit pack purchase via Stripe checkout.

**Request:**
```json
{
  "packId": "pack_100"
}
```

**Response:**
```json
{
  "ok": true,
  "sessionId": "cs_1234567890",
  "url": "https://checkout.stripe.com/..."
}
```

## Integration with Access Control

Credits override subscription status:
- Users with credits > 0 can always use the service
- Credits are checked first in `accessControlService.evaluateAccess()`
- If credits exist, access is granted regardless of subscription status

## Best Practices

1. **Always check balance before spending** - Use `getBalance()` first
2. **Handle insufficient credits gracefully** - Show user-friendly error
3. **Log metadata with transactions** - Include context (image URL, plugin, etc.)
4. **Use atomic operations** - `deductCreditByEmail()` prevents race conditions
5. **Events are source of truth** - Cached balance is for performance only
6. **Handle errors gracefully** - Credits system never throws, always returns result object

## Database Schema

### events Table

- `id` - UUID primary key
- `identity_id` - Foreign key to identities table
- `event_type` - Event type (e.g., 'credit_purchase', 'credit_used')
- `credits_delta` - Credit change (positive for purchases, negative for usage)
- `metadata` - JSON metadata
- `created_at` - Timestamp

### identities Table

- `id` - UUID primary key
- `email` - User email (indexed)
- `credits_balance` - Cached credit balance (updated by eventService)
- `created_at` - Timestamp
- `updated_at` - Timestamp

### credits_transactions Table

- `id` - UUID primary key
- `identity_id` - Foreign key to identities table
- `transaction_type` - Type ('purchase', 'usage', 'refund')
- `amount` - Credit amount
- `balance_after` - Balance after transaction
- `metadata` - JSON metadata
- `created_at` - Timestamp


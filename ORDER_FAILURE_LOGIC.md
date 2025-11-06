# Order Failure Logic - How Orders Fail or Succeed

## Current Implementation

The system uses **random probability-based failure simulation** for testing and demonstration purposes. Each stage has a fixed failure rate:

### Failure Rates by Stage

| Stage | Failure Rate | Location |
|-------|-------------|----------|
| **Inventory** | 20% (0.2) | `process-inventory/index.ts:23` |
| **Payment** | 15% (0.15) | `process-payment/index.ts:23` |
| **Shipping** | 5% (0.05) | `process-shipping/index.ts:23` |

## How It Works

### 1. Inventory Processing (`process-inventory/index.ts`)

```typescript
// Line 22-23: 20% failure rate
const shouldFail = Math.random() < 0.2;

if (shouldFail) {
  // Order fails with "Insufficient inventory"
  // Status → 'failed'
  // Current Stage → 'inventory'
  // Event → 'InventoryFailed'
  // Added to Dead Letter Queue
}
```

**Failure Reason**: `"Insufficient inventory"` / `"Out of stock"`

### 2. Payment Processing (`process-payment/index.ts`)

```typescript
// Line 22-23: 15% failure rate
const shouldFail = Math.random() < 0.15;

if (shouldFail) {
  // Order fails with "Payment declined"
  // Status → 'failed'
  // Current Stage → 'payment'
  // Event → 'PaymentFailed'
  // Compensation → 'CompensationStarted' (releases inventory)
  // Added to Dead Letter Queue
}
```

**Failure Reason**: `"Payment declined"` / `"Insufficient funds"`

**Special Behavior**: When payment fails, the system triggers **compensation** to release the previously reserved inventory.

### 3. Shipping Processing (`process-shipping/index.ts`)

```typescript
// Line 22-23: 5% failure rate
const shouldFail = Math.random() < 0.05;

if (shouldFail) {
  // Order fails with "Shipping unavailable"
  // Status → 'failed'
  // Current Stage → 'shipping'
  // Event → 'OrderFailed'
}
```

**Failure Reason**: `"Shipping unavailable"` / `"Address validation failed"`

## Decision Flow

```
Order Created
    ↓
Inventory Check (20% fail chance)
    ├─ FAIL → Order Failed (inventory stage)
    └─ SUCCESS → Continue
         ↓
Payment Processing (15% fail chance)
    ├─ FAIL → Order Failed (payment stage) + Compensation
    └─ SUCCESS → Continue
         ↓
Shipping Processing (5% fail chance)
    ├─ FAIL → Order Failed (shipping stage)
    └─ SUCCESS → Order Completed ✅
```

## Key Points

1. **Purely Random**: Uses `Math.random()` - no real business logic
2. **Fixed Probabilities**: Hardcoded failure rates
3. **Deterministic Simulation**: Each call is independent
4. **No State Persistence**: Same order could succeed on retry (different random value)

## Example Scenarios

### Scenario 1: Successful Order
```
Order Created
  → Inventory: Math.random() = 0.85 (> 0.2) ✅ PASS
  → Payment: Math.random() = 0.90 (> 0.15) ✅ PASS
  → Shipping: Math.random() = 0.98 (> 0.05) ✅ PASS
  → Order Completed
```

### Scenario 2: Inventory Failure
```
Order Created
  → Inventory: Math.random() = 0.15 (< 0.2) ❌ FAIL
  → Order Failed (inventory stage)
```

### Scenario 3: Payment Failure with Compensation
```
Order Created
  → Inventory: Math.random() = 0.85 (> 0.2) ✅ PASS
  → Payment: Math.random() = 0.10 (< 0.15) ❌ FAIL
  → Compensation Started (release inventory)
  → Order Failed (payment stage)
```

## Current Limitations

1. **No Real Business Logic**: Doesn't check actual inventory, payment methods, or addresses
2. **Not Configurable**: Failure rates are hardcoded
3. **No Retry Logic in Functions**: Manual retry via API only
4. **No Deterministic Failures**: Same order ID might succeed on retry

## Making It Production-Ready

To make this production-ready, you would:

1. **Replace Random Logic with Real Checks**:
   ```typescript
   // Instead of: Math.random() < 0.2
   // Use: await checkInventoryAvailability(order.items)
   ```

2. **Make Failure Rates Configurable**:
   ```typescript
   const failureRate = parseFloat(Deno.env.get('INVENTORY_FAILURE_RATE') || '0.2');
   ```

3. **Add Deterministic Logic**:
   - Check actual inventory levels
   - Validate payment methods
   - Verify shipping addresses

4. **Implement Retry Logic**:
   - Automatic retries with exponential backoff
   - Configurable max attempts

## ✅ Configuration (Now Implemented!)

Failure rates are **now configurable** via environment variables! The system uses a centralized config module.

### Configuration Module

Location: `supabase/functions/_shared/config.ts`

### Environment Variables

Set these in your Supabase Edge Function environment variables:

```env
# Inventory Service
INVENTORY_FAILURE_RATE=0.2          # Default: 20%
INVENTORY_MIN_DELAY_MS=1000         # Default: 1 second
INVENTORY_MAX_DELAY_MS=3000         # Default: 3 seconds

# Payment Service
PAYMENT_FAILURE_RATE=0.15            # Default: 15%
PAYMENT_MIN_DELAY_MS=1500            # Default: 1.5 seconds
PAYMENT_MAX_DELAY_MS=4000            # Default: 4 seconds

# Shipping Service
SHIPPING_FAILURE_RATE=0.05           # Default: 5%
SHIPPING_MIN_DELAY_MS=2000           # Default: 2 seconds
SHIPPING_MAX_DELAY_MS=5000           # Default: 5 seconds
```

### Usage Examples

**Disable all failures (production mode):**
```env
INVENTORY_FAILURE_RATE=0
PAYMENT_FAILURE_RATE=0
SHIPPING_FAILURE_RATE=0
```

**Increase failure rates for testing:**
```env
INVENTORY_FAILURE_RATE=0.5    # 50% failure rate
PAYMENT_FAILURE_RATE=0.3      # 30% failure rate
SHIPPING_FAILURE_RATE=0.1     # 10% failure rate
```

**Faster processing (reduce delays):**
```env
INVENTORY_MIN_DELAY_MS=500
INVENTORY_MAX_DELAY_MS=1000
```

### How It Works

All three processing functions now use:
```typescript
import { getProcessingConfig, checkShouldFail, randomDelay } from '../_shared/config.ts';

const config = getProcessingConfig();
const shouldFail = checkShouldFail(config.inventory.failureRate);
const delay = randomDelay(config.inventory.minDelayMs, config.inventory.maxDelayMs);
```

This provides:
- ✅ Centralized configuration
- ✅ Environment variable support
- ✅ Sensible defaults
- ✅ Configurable delays


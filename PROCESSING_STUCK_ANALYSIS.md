# Why Orders Get Stuck in "Processing" Status

## What "Processing" Means

An order with status `"processing"` means:
- The order has moved past the initial "pending" stage
- It's currently being processed by one of the pipeline stages:
  - **Inventory** (checking/reserving stock)
  - **Payment** (authorizing payment)
  - **Shipping** (preparing shipment)

## Common Causes of Stuck Orders

### 1. **HTTP Fetch Failures (Silent Failures)** ⚠️ MOST COMMON

**Problem**: Services trigger the next stage using `fetch()` with `.catch()` that only logs errors:

```typescript
// process-inventory/index.ts:79
fetch(`${supabaseUrl}/functions/v1/process-payment`, {
  // ... triggers payment
}).catch(err => console.error('Error triggering payment:', err));
// ❌ Error is logged but order status doesn't change!
```

**What happens**:
- If the next service call fails (network error, timeout, service down)
- Error is logged but order stays in "processing"
- No status update to "failed"
- Order appears stuck

**Example Scenario**:
```
Order Created → Inventory Reserved → Status: "processing", Stage: "payment"
  ↓
Payment service fetch() fails (network error)
  ↓
Error logged but order status unchanged
  ↓
Order stuck at "processing" / "payment" stage
```

### 2. **Service Timeouts**

**Problem**: No timeout on `fetch()` calls - can hang indefinitely

**What happens**:
- Service call starts but never completes
- No response, no error
- Order waits forever

### 3. **Service Crashes During Processing**

**Problem**: If a service crashes mid-execution (before updating status)

**What happens**:
- Service starts processing
- Crashes before updating order status
- Order remains in "processing"

### 4. **Processing Delays**

**Problem**: Services have random delays (1-5 seconds). If interrupted:
- Status update might not happen
- Order remains in intermediate state

### 5. **Retry Function Issues**

**Problem**: When retrying, if the service URL is wrong or service doesn't exist:
- Retry sets status to "processing"
- But service never actually gets called
- Order stuck

## How to Diagnose

### Check the Event Timeline

1. **Look at the last event**:
   - If last event is `InventoryReserved` → Stuck waiting for payment
   - If last event is `PaymentAuthorized` → Stuck waiting for shipping
   - If last event is `OrderRetried` → Retry might have failed

2. **Check the `current_stage`**:
   - `inventory` → Waiting for payment service
   - `payment` → Waiting for shipping service
   - `shipping` → Should complete soon or has crashed

3. **Check for time gaps**:
   - If last event was > 30 seconds ago → Likely stuck
   - Normal processing: 1-5 seconds per stage

### Check Supabase Logs

Look for:
- `Error triggering payment:` - Next service call failed
- `Error processing inventory:` - Service crashed
- Missing logs for expected events

## Solutions

### Immediate Fix: Manual Retry

If you see a stuck order:
1. Check which stage it's stuck at (`current_stage`)
2. Click "Retry Order" button
3. This will reset status and retry from the failed stage

### Long-term Fixes Needed

1. **Add timeout to fetch calls**
2. **Add error handling that updates status**
3. **Add retry logic with exponential backoff**
4. **Add timeout/expiry tracking**
5. **Add monitoring/alerts for stuck orders**

## Current Status Flow

```
Order Created (pending)
  ↓
Inventory Reserved (processing, stage: payment)
  ↓ [fetch() calls payment]
Payment Authorized (processing, stage: shipping)
  ↓ [fetch() calls shipping]
Order Shipped (completed)
```

**Stuck points**:
- ❌ After Inventory Reserved → Payment fetch fails
- ❌ After Payment Authorized → Shipping fetch fails
- ❌ During any service execution → Service crashes

## Quick Diagnostic Checklist

- [ ] Last event timestamp (how long ago?)
- [ ] Current stage (which stage is it stuck at?)
- [ ] Last event type (what was the last successful step?)
- [ ] Check Supabase function logs for errors
- [ ] Try manual retry button

## Expected Processing Times

- **Inventory**: 1-3 seconds
- **Payment**: 1.5-4 seconds
- **Shipping**: 2-5 seconds
- **Total**: ~5-12 seconds normally

**If > 30 seconds**: Likely stuck, needs intervention.



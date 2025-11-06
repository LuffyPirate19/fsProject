# What It Means When an Order Is Stuck at "Processing"

## Quick Answer

**"Processing" means the order is actively moving through the pipeline stages** (inventory → payment → shipping). If it's **stuck**, it means:
- The order started processing but hasn't completed or failed
- The next service call likely failed silently
- The order status wasn't updated to reflect the failure

## What "Processing" Status Means

When an order shows status `"processing"`, it's in one of these stages:

| Status | Current Stage | What's Happening |
|--------|--------------|------------------|
| `processing` | `inventory` | Checking/reserving inventory |
| `processing` | `payment` | Authorizing payment |
| `processing` | `shipping` | Preparing shipment |

## When It Gets Stuck

An order gets stuck when:

1. **Next service call fails** (most common)
   - Inventory succeeds → tries to call Payment → Payment call fails
   - Order stays at "processing" / "payment" stage
   - No error is recorded, order appears stuck

2. **Service timeout**
   - Service call takes too long (>10 seconds)
   - No response received
   - Order waits indefinitely

3. **Service crashes**
   - Service starts processing but crashes mid-execution
   - Status never updated
   - Order remains in processing state

## How to Identify Stuck Orders

### Visual Indicators

✅ **Normal Processing**:
- Order just created/retried (< 30 seconds ago)
- Recent events in timeline
- Status updates appearing

⚠️ **Potentially Stuck**:
- Order processing > 30 seconds
- No new events in timeline
- Last event is successful (InventoryReserved, PaymentAuthorized)
- "Order May Be Stuck" warning appears

### Diagnostic Tool

Click the **"Diagnose"** button on stuck orders to see:
- How long since last event
- Which stage it's stuck at
- What should happen next
- Likely issue and recommendation

## What I Fixed

### ✅ **Added Timeout Handling**
- 10-second timeout on service-to-service calls
- If timeout occurs, order status updates to "failed"
- Error event created explaining the timeout

### ✅ **Better Error Handling**
- Failed service calls now update order status
- Error events are created for debugging
- Orders don't stay stuck indefinitely

### ✅ **Stuck Order Detection**
- Automatic detection of orders stuck > 30 seconds
- Visual warning on OrderDetail page
- Diagnostic tool to investigate issues

### ✅ **Diagnostic Endpoint**
- New `/diagnose-order` function
- Provides detailed analysis of stuck orders
- Shows recommendations for resolution

## How to Fix Stuck Orders

### Option 1: Use Diagnostic Tool
1. Click "Diagnose" button on stuck order
2. Review diagnostic results
3. Follow recommendations

### Option 2: Manual Retry
1. If order is stuck, it may show as "failed" after timeout
2. Click "Retry Order" button
3. Order will restart from the failed stage

### Option 3: Check Logs
1. Check Supabase function logs
2. Look for "Error triggering payment" or "Error triggering shipping"
3. These indicate which service call failed

## Expected Processing Times

- **Inventory**: 1-3 seconds
- **Payment**: 1.5-4 seconds  
- **Shipping**: 2-5 seconds
- **Total**: ~5-12 seconds normally

**If > 30 seconds**: Order is likely stuck and needs attention.

## Prevention

The fixes I implemented will:
- ✅ Automatically detect and fail orders when service calls timeout
- ✅ Update order status on failures (no silent failures)
- ✅ Show warnings when orders appear stuck
- ✅ Provide diagnostic tools to investigate issues

**Going forward**, orders should not get stuck for long periods - they'll either:
- Complete successfully
- Fail with clear error messages
- Timeout after 10 seconds and mark as failed



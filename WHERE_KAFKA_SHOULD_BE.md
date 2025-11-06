# Where Kafka Should Be Used (But Isn't)

## Quick Answer

**Kafka is NOT used anywhere in this project.** The system uses **HTTP `fetch()` calls** instead.

## Current Implementation (HTTP Calls)

### 1. Order Creation → Inventory Processing
**File**: `supabase/functions/create-order/index.ts:183`
```typescript
// ❌ CURRENT: HTTP call
fetch(`${supabaseUrl}/functions/v1/process-inventory`, {
  method: 'POST',
  body: JSON.stringify({ orderId, correlationId }),
})

// ✅ SHOULD BE: Kafka producer
await kafkaProducer.send({
  topic: 'order-events',
  messages: [{
    key: orderId,  // Partition by orderId
    value: JSON.stringify({
      eventType: 'OrderCreated',
      orderId,
      correlationId,
      ...
    }),
  }],
});
```

### 2. Inventory → Payment Processing
**File**: `supabase/functions/process-inventory/index.ts:80`
```typescript
// ❌ CURRENT: HTTP call
fetch(`${supabaseUrl}/functions/v1/process-payment`, {
  method: 'POST',
  body: JSON.stringify({ orderId, correlationId }),
})

// ✅ SHOULD BE: Kafka producer
await kafkaProducer.send({
  topic: 'inventory-events',
  messages: [{
    key: orderId,
    value: JSON.stringify({
      eventType: 'InventoryReserved',
      orderId,
      correlationId,
      ...
    }),
  }],
});
```

### 3. Payment → Shipping Processing
**File**: `supabase/functions/process-payment/index.ts:88`
```typescript
// ❌ CURRENT: HTTP call
fetch(`${supabaseUrl}/functions/v1/process-shipping`, {
  method: 'POST',
  body: JSON.stringify({ orderId, correlationId }),
})

// ✅ SHOULD BE: Kafka producer
await kafkaProducer.send({
  topic: 'payment-events',
  messages: [{
    key: orderId,
    value: JSON.stringify({
      eventType: 'PaymentAuthorized',
      orderId,
      correlationId,
      ...
    }),
  }],
});
```

## Service Consumer Implementation (Missing)

### Inventory Service Consumer (Should Exist)
```typescript
// ❌ MISSING: Should be in inventory-service
const consumer = kafka.consumer({ groupId: 'inventory-service-group' });

await consumer.subscribe({ topic: 'order-events' });

await consumer.run({
  eachMessage: async ({ message, partition }) => {
    const event = JSON.parse(message.value.toString());
    if (event.eventType === 'OrderCreated') {
      await processInventory(event.orderId, event.correlationId);
    }
  },
});
```

### Payment Service Consumer (Should Exist)
```typescript
// ❌ MISSING: Should be in payment-service
const consumer = kafka.consumer({ groupId: 'payment-service-group' });

await consumer.subscribe({ topic: 'inventory-events' });

await consumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value.toString());
    if (event.eventType === 'InventoryReserved') {
      await processPayment(event.orderId, event.correlationId);
    }
  },
});
```

### Shipping Service Consumer (Should Exist)
```typescript
// ❌ MISSING: Should be in shipping-service
const consumer = kafka.consumer({ groupId: 'shipping-service-group' });

await consumer.subscribe({ topic: 'payment-events' });

await consumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value.toString());
    if (event.eventType === 'PaymentAuthorized') {
      await processShipping(event.orderId, event.correlationId);
    }
  },
});
```

## Current Architecture Flow

```
┌─────────────────┐
│  Order Service  │
│  (Edge Function)│
└────────┬────────┘
         │ HTTP fetch()
         ↓
┌─────────────────┐
│Inventory Service│
│  (Edge Function)│
└────────┬────────┘
         │ HTTP fetch()
         ↓
┌─────────────────┐
│ Payment Service │
│  (Edge Function)│
└────────┬────────┘
         │ HTTP fetch()
         ↓
┌─────────────────┐
│Shipping Service │
│  (Edge Function)│
└─────────────────┘
```

## Required Architecture with Kafka

```
┌─────────────────┐
│  Order Service  │
│   (Node.js)     │
└────────┬────────┘
         │ Producer → order-events topic
         ↓
┌─────────────────────────────────┐
│      Kafka: order-events        │
│    (Partitioned by orderId)     │
└────────┬────────────────────────┘
         │ Consumer
         ↓
┌─────────────────┐
│Inventory Service│
│   (Node.js)     │
└────────┬────────┘
         │ Producer → inventory-events topic
         ↓
┌─────────────────────────────────┐
│   Kafka: inventory-events       │
│    (Partitioned by orderId)     │
└────────┬────────────────────────┘
         │ Consumer
         ↓
┌─────────────────┐
│ Payment Service │
│   (Node.js)     │
└────────┬────────┘
         │ Producer → payment-events topic
         ↓
┌─────────────────────────────────┐
│     Kafka: payment-events       │
│    (Partitioned by orderId)     │
└────────┬────────────────────────┘
         │ Consumer
         ↓
┌─────────────────┐
│Shipping Service │
│   (Node.js)     │
└─────────────────┘
```

## Key Differences

| Aspect | Current (HTTP) | Required (Kafka) |
|--------|---------------|------------------|
| **Communication** | Synchronous HTTP calls | Asynchronous message queue |
| **Persistence** | No message persistence | Messages persisted in Kafka |
| **Retries** | Manual retry logic | Automatic via consumer groups |
| **Ordering** | No guarantees | Guaranteed via partitioning |
| **Scalability** | One request at a time | Parallel processing possible |
| **Decoupling** | Services must be online | Services can process offline |
| **Failure Handling** | HTTP errors only | DLQ topics for failed messages |

## Summary

**Kafka is used NOWHERE in the current codebase.**

Instead, the project uses:
- `fetch()` calls in `create-order/index.ts`
- `fetch()` calls in `process-inventory/index.ts`
- `fetch()` calls in `process-payment/index.ts`
- `fetch()` calls in `retry-failed-order/index.ts`

To implement Kafka, you would need to:
1. Set up Kafka infrastructure (Docker Compose)
2. Create Kafka producers for each service
3. Create Kafka consumers for each service
4. Replace all `fetch()` calls with Kafka producers
5. Replace HTTP-triggered functions with Kafka consumers
6. Migrate from Deno Edge Functions to Node.js services



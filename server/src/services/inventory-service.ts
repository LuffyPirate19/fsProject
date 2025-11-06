import { getCollections } from '../db/mongodb.js';
import { Logger } from '../utils/logger.js';
import { checkIdempotency, storeIdempotencyKey } from '../utils/idempotency.js';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('inventory-service');

export interface ProcessInventoryRequest {
  orderId: string;
  correlationId: string;
}

/**
 * Process inventory reservation
 */
export async function processInventory(body: ProcessInventoryRequest): Promise<void> {
  const collections = getCollections();
  const { orderId, correlationId } = body;

  if (!orderId || !correlationId) {
    throw new Error('Missing orderId or correlationId');
  }

  logger.info('Processing inventory', { orderId, correlationId });

  // Check for duplicate event (idempotency)
  const idempotencyCheck = await checkIdempotency(
    collections.idempotencyKeys,
    collections.orderEvents,
    'InventoryReserved',
    orderId,
    correlationId
  );

  if (idempotencyCheck.isDuplicate) {
    logger.info('Inventory already processed (idempotent)', {
      orderId,
      correlationId,
      existingEventId: idempotencyCheck.existingEventId,
    });
    return;
  }

  // Get configurable failure rate (default: 25% - adjusted for testing to demonstrate failure handling)
  const failureRate = parseFloat(process.env.INVENTORY_FAILURE_RATE || '0.25');
  const minDelay = parseInt(process.env.INVENTORY_MIN_DELAY_MS || '1000');
  const maxDelay = parseInt(process.env.INVENTORY_MAX_DELAY_MS || '3000');
  
  const shouldFail = Math.random() < failureRate;
  const delay = minDelay + Math.random() * (maxDelay - minDelay);

  await new Promise(resolve => setTimeout(resolve, delay));

  if (shouldFail) {
    logger.warn('Inventory reservation failed', { orderId, correlationId });

    const eventId = uuidv4();
    const eventDoc = {
      id: eventId,
      eventType: 'InventoryFailed',
      orderId,
      correlationId,
      causationId: null,
      version: 1,
      payload: { reason: 'Simulated inventory failure' },
      service: 'inventory-service',
      retryCount: 0,
      errorMessage: 'Inventory reservation failed',
      createdAt: new Date(),
    };

    await collections.orderEvents.insertOne(eventDoc);

    // Update order status
    await collections.orders.updateOne(
      { id: orderId },
      {
        $set: {
          status: 'failed',
          currentStage: 'inventory',
          updatedAt: new Date(),
        },
      }
    );

    // Add to DLQ
    await collections.deadLetterQueue.insertOne({
      id: uuidv4(),
      orderId,
      eventType: 'InventoryFailed',
      eventData: eventDoc,
      errorMessage: 'Inventory reservation failed',
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    throw new Error('Inventory reservation failed');
  }

  // Success - create InventoryReserved event
  const eventId = uuidv4();
  const eventDoc = {
    id: eventId,
    eventType: 'InventoryReserved',
    orderId,
    correlationId,
    causationId: null,
    version: 1,
    payload: { reserved: true },
    service: 'inventory-service',
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(),
  };

  await collections.orderEvents.insertOne(eventDoc);

  // Store idempotency key
  await storeIdempotencyKey(
    collections.idempotencyKeys,
    'InventoryReserved',
    orderId,
    correlationId,
    eventId
  );

  // Update order status
  await collections.orders.updateOne(
    { id: orderId },
    {
      $set: {
        status: 'processing',
        currentStage: 'inventory',
        updatedAt: new Date(),
      },
    }
  );

  logger.info('Inventory reserved successfully', { orderId, correlationId, eventId });

  // Trigger payment processing (async)
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  fetch(`${apiUrl}/api/process-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderId, correlationId }),
  }).catch(err => {
    logger.error('Failed to trigger payment processing', err as Error, { orderId });
    
    // Mark order as failed if next service call fails
    collections.orders.updateOne(
      { id: orderId },
      {
        $set: {
          status: 'failed',
          currentStage: 'payment',
          updatedAt: new Date(),
        },
      }
    );

    collections.orderEvents.insertOne({
      id: uuidv4(),
      eventType: 'OrderFailed',
      orderId,
      correlationId,
      causationId: null,
      version: 1,
      payload: { reason: 'Payment service call failed' },
      service: 'inventory-service',
      retryCount: 0,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      createdAt: new Date(),
    });
  });
}


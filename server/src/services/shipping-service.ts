import { getCollections } from '../db/mongodb.js';
import { Logger } from '../utils/logger.js';
import { checkIdempotency, storeIdempotencyKey } from '../utils/idempotency.js';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('shipping-service');

export interface ProcessShippingRequest {
  orderId: string;
  correlationId: string;
}

/**
 * Process shipping
 */
export async function processShipping(body: ProcessShippingRequest): Promise<void> {
  const collections = getCollections();
  const { orderId, correlationId } = body;

  if (!orderId || !correlationId) {
    throw new Error('Missing orderId or correlationId');
  }

  logger.info('Processing shipping', { orderId, correlationId });

  // Check for duplicate event (idempotency)
  const idempotencyCheck = await checkIdempotency(
    collections.idempotencyKeys,
    collections.orderEvents,
    'OrderShipped',
    orderId,
    correlationId
  );

  if (idempotencyCheck.isDuplicate) {
    logger.info('Shipping already processed (idempotent)', {
      orderId,
      correlationId,
      existingEventId: idempotencyCheck.existingEventId,
    });
    return;
  }

  // Get configurable failure rate (default: 10% - adjusted for testing to demonstrate failure handling)
  const failureRate = parseFloat(process.env.SHIPPING_FAILURE_RATE || '0.10');
  const minDelay = parseInt(process.env.SHIPPING_MIN_DELAY_MS || '2000');
  const maxDelay = parseInt(process.env.SHIPPING_MAX_DELAY_MS || '5000');
  
  const shouldFail = Math.random() < failureRate;
  const delay = minDelay + Math.random() * (maxDelay - minDelay);

  await new Promise(resolve => setTimeout(resolve, delay));

  if (shouldFail) {
    logger.warn('Shipping failed', { orderId, correlationId });

    // Enhanced Saga: Compensation on shipping failure
    // Refund payment and release inventory
    await collections.orderEvents.insertOne({
      id: uuidv4(),
      eventType: 'CompensationStarted',
      orderId,
      correlationId,
      causationId: null,
      version: 1,
      payload: {
        action: 'refund_payment_and_release_inventory',
        reason: 'Shipping failure compensation',
      },
      service: 'compensation-service',
      retryCount: 0,
      errorMessage: null,
      createdAt: new Date(),
    });

    const eventId = uuidv4();
    const eventDoc = {
      id: eventId,
      eventType: 'OrderFailed',
      orderId,
      correlationId,
      causationId: null,
      version: 1,
      payload: { reason: 'Shipping failed' },
      service: 'shipping-service',
      retryCount: 0,
      errorMessage: 'Shipping processing failed',
      createdAt: new Date(),
    };

    await collections.orderEvents.insertOne(eventDoc);

    // Update order status
    await collections.orders.updateOne(
      { id: orderId },
      {
        $set: {
          status: 'failed',
          currentStage: 'shipping',
          updatedAt: new Date(),
        },
      }
    );

    // Add to DLQ
    await collections.deadLetterQueue.insertOne({
      id: uuidv4(),
      orderId,
      eventType: 'OrderFailed',
      eventData: eventDoc,
      errorMessage: 'Shipping processing failed',
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    throw new Error('Shipping processing failed');
  }

  // Success - create OrderShipped event
  const eventId = uuidv4();
  const eventDoc = {
    id: eventId,
    eventType: 'OrderShipped',
    orderId,
    correlationId,
    causationId: null,
    version: 1,
    payload: { shipped: true, trackingNumber: `TRACK-${Date.now()}` },
    service: 'shipping-service',
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(),
  };

  await collections.orderEvents.insertOne(eventDoc);

  // Store idempotency key
  await storeIdempotencyKey(
    collections.idempotencyKeys,
    'OrderShipped',
    orderId,
    correlationId,
    eventId
  );

  // Update order status to completed
  await collections.orders.updateOne(
    { id: orderId },
    {
      $set: {
        status: 'completed',
        currentStage: 'completed',
        updatedAt: new Date(),
      },
    }
  );

  logger.info('Order shipped successfully', { orderId, correlationId, eventId });
}


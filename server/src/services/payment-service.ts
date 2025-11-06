import { getCollections } from '../db/mongodb.js';
import { Logger } from '../utils/logger.js';
import { checkIdempotency, storeIdempotencyKey } from '../utils/idempotency.js';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('payment-service');

export interface ProcessPaymentRequest {
  orderId: string;
  correlationId: string;
}

/**
 * Process payment authorization
 */
export async function processPayment(body: ProcessPaymentRequest): Promise<void> {
  const collections = getCollections();
  const { orderId, correlationId } = body;

  if (!orderId || !correlationId) {
    throw new Error('Missing orderId or correlationId');
  }

  logger.info('Processing payment', { orderId, correlationId });

  // Check for duplicate event (idempotency)
  const idempotencyCheck = await checkIdempotency(
    collections.idempotencyKeys,
    collections.orderEvents,
    'PaymentAuthorized',
    orderId,
    correlationId
  );

  if (idempotencyCheck.isDuplicate) {
    logger.info('Payment already processed (idempotent)', {
      orderId,
      correlationId,
      existingEventId: idempotencyCheck.existingEventId,
    });
    return;
  }

  // Get configurable failure rate (default: 20% - adjusted for testing to demonstrate failure handling)
  const failureRate = parseFloat(process.env.PAYMENT_FAILURE_RATE || '0.20');
  const minDelay = parseInt(process.env.PAYMENT_MIN_DELAY_MS || '1500');
  const maxDelay = parseInt(process.env.PAYMENT_MAX_DELAY_MS || '4000');
  
  const shouldFail = Math.random() < failureRate;
  const delay = minDelay + Math.random() * (maxDelay - minDelay);

  await new Promise(resolve => setTimeout(resolve, delay));

  if (shouldFail) {
    logger.warn('Payment authorization failed', { orderId, correlationId });

    const eventId = uuidv4();
    const eventDoc = {
      id: eventId,
      eventType: 'PaymentFailed',
      orderId,
      correlationId,
      causationId: null,
      version: 1,
      payload: { reason: 'Payment declined' },
      service: 'payment-service',
      retryCount: 0,
      errorMessage: 'Payment authorization failed',
      createdAt: new Date(),
    };

    await collections.orderEvents.insertOne(eventDoc);

    // Update order status
    await collections.orders.updateOne(
      { id: orderId },
      {
        $set: {
          status: 'failed',
          currentStage: 'payment',
          updatedAt: new Date(),
        },
      }
    );

    // Add to DLQ
    await collections.deadLetterQueue.insertOne({
      id: uuidv4(),
      orderId,
      eventType: 'PaymentFailed',
      eventData: eventDoc,
      errorMessage: 'Payment authorization failed',
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    throw new Error('Payment authorization failed');
  }

  // Success - create PaymentAuthorized event
  const eventId = uuidv4();
  const eventDoc = {
    id: eventId,
    eventType: 'PaymentAuthorized',
    orderId,
    correlationId,
    causationId: null,
    version: 1,
    payload: { authorized: true },
    service: 'payment-service',
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(),
  };

  await collections.orderEvents.insertOne(eventDoc);

  // Store idempotency key
  await storeIdempotencyKey(
    collections.idempotencyKeys,
    'PaymentAuthorized',
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
        currentStage: 'payment',
        updatedAt: new Date(),
      },
    }
  );

  logger.info('Payment authorized successfully', { orderId, correlationId, eventId });

  // Trigger shipping processing (async)
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  fetch(`${apiUrl}/api/process-shipping`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderId, correlationId }),
  }).catch(err => {
    logger.error('Failed to trigger shipping processing', err as Error, { orderId });
    
    // Mark order as failed if next service call fails
    collections.orders.updateOne(
      { id: orderId },
      {
        $set: {
          status: 'failed',
          currentStage: 'shipping',
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
      payload: { reason: 'Shipping service call failed' },
      service: 'payment-service',
      retryCount: 0,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      createdAt: new Date(),
    });
  });
}

